const ROOT = "sendwayo_express_v2";
const STRIPE_API = "https://api.stripe.com/v1";
const TRANZAK_API = "https://api.tranzak.co/api/gateway/v1";
const TRANZAK_TREASURY = "https://api.tranzak.co/api/treasury/v1";
const FIREBASE_JWKS = "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";
const FIREBASE_TOKEN_ISSUER = "https://securetoken.google.com/";
const JSON_HEADERS = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" };
const ZERO_DECIMAL = new Set(["BIF","CLP","DJF","GNF","ISK","JPY","KMF","KRW","PYG","RWF","UGX","VND","VUV","XAF","XOF","XPF"]);
const STRIPE_ACCOUNT_COUNTRIES = new Set("AU AT BE BG BR CA HR CY CZ DK EE FI FR DE GI GR HK HU IE IT JP LV LI LT LU MY MT MX NL NZ NO PL PT RO SG SK SI ES SE CH TH AE GB US".split(" "));
export function isStripeAccountCountrySupported(country) { return STRIPE_ACCOUNT_COUNTRIES.has(normalizeCountry(country)); }
let jwkCache = { value: null, until: 0 };
let serviceTokenCache = { value: "", until: 0 };

const nowSeconds = () => Math.floor(Date.now() / 1000);
const enc = new TextEncoder();
const toB64Url = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/=/g,"").replace(/\+/g,"-").replace(/\//g,"_");
const fromB64Url = (value) => Uint8Array.from(atob(value.replace(/-/g,"+").replace(/_/g,"/") + "=".repeat((4-value.length%4)%4)), c => c.charCodeAt(0));
const hex = (bytes) => [...new Uint8Array(bytes)].map(x => x.toString(16).padStart(2,"0")).join("");
const safeEqual = (a,b) => {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let diff = 0; for (let i=0;i<a.length;i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
};
const clean = (v,max=250) => String(v ?? "").trim().slice(0,max);
const money = (v) => Math.round(Number(v) * 100) / 100;
const newId = () => "SWP-" + Date.now().toString(36).toUpperCase() + "-" + crypto.randomUUID().slice(0,8).toUpperCase();
const safeKey = (v) => {
  const key = clean(v,180);
  if (!/^[A-Za-z0-9_-]{4,180}$/.test(key)) throw new Error("Identificador de transacción no válido.");
  return key;
};
const normalizeCurrency = (v) => clean(v,3).toUpperCase();
const normalizeCountry = (v) => clean(v,10).toUpperCase();

export function amountToMinor(amount, currency) {
  const value = Number(amount);
  const code = normalizeCurrency(currency);
  if (!Number.isFinite(value) || value <= 0 || !/^[A-Z]{3}$/.test(code)) throw new Error("Importe o moneda no válidos.");
  const factor = ZERO_DECIMAL.has(code) ? 1 : 100;
  const result = Math.round(value * factor);
  if (Math.abs(result / factor - value) > 0.000001) throw new Error("El importe tiene demasiados decimales para " + code + ".");
  return result;
}

export function validatePaymentInput(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Solicitud de pago no válida.");
  const sourceAmount = money(input.sourceAmount);
  const totalCharged = money(input.totalCharged ?? input.sourceAmount);
  const sourceCurrency = normalizeCurrency(input.sourceCurrency);
  const targetCurrency = normalizeCurrency(input.targetCurrency);
  if (input.targetAmount == null && sourceCurrency !== targetCurrency) throw new Error("La entrega en otra moneda debe indicarse explícitamente; no se aplicará una tasa automática.");
  const targetAmount = input.targetAmount == null && sourceCurrency === targetCurrency ? sourceAmount : money(input.targetAmount);
  const countryFrom = normalizeCountry(input.countryFrom || input.senderInfo?.country);
  const countryTo = normalizeCountry(input.countryTo || input.recipientInfo?.country);
  if (!(sourceAmount > 0) || !(totalCharged >= sourceAmount) || !(targetAmount > 0)) throw new Error("Indique importes de origen, total cobrado y entrega mayores que cero.");
  if (!/^[A-Z]{3}$/.test(sourceCurrency) || !/^[A-Z]{3}$/.test(targetCurrency)) throw new Error("Las monedas deben usar códigos ISO de tres letras.");
  if (!/^[A-Z]{2}$/.test(countryFrom) || !/^[A-Z]{2}$/.test(countryTo)) throw new Error("Seleccione país de origen y destino usando códigos ISO de dos letras.");
  const senderName = clean(input.senderInfo?.fullName,120);
  const senderPhone = clean(input.senderInfo?.phone,32);
  const recipientName = clean(input.recipientInfo?.fullName || input.recipientInfo?.name,120);
  const recipientPhone = clean(input.recipientInfo?.phoneOrAccount || input.recipientInfo?.phone,100);
  if (!senderName || !senderPhone || !recipientName || !recipientPhone) throw new Error("Complete los datos del remitente y del beneficiario.");
  return {
    sourceAmount, totalCharged, targetAmount, sourceCurrency, targetCurrency, countryFrom, countryTo,
    senderInfo: { fullName: senderName, phone: senderPhone, country: countryFrom },
    recipientInfo: {
      fullName: recipientName, provider: clean(input.recipientInfo?.provider,40),
      destinationType: clean(input.recipientInfo?.destinationType || "BANK",40).toUpperCase(),
      phoneOrAccount: recipientPhone, country: countryTo
    },
    payoutDetails: input.payoutDetails && typeof input.payoutDetails === "object" ? input.payoutDetails : {}
  };
}

export function validatePayoutInput(payout) {
  const network = clean(payout?.network || payout?.provider,20).toLowerCase();
  const amount = Number(payout?.targetAmount ?? payout?.amount);
  const currency = normalizeCurrency(payout?.targetCurrency || payout?.currency);
  const receiver = clean(payout?.receiver || payout?.phoneOrAccount,40).replace(/[ +()-]/g,"");
  if (!["moncash","natcash"].includes(network)) throw new Error("Red de dispersión no compatible.");
  if (currency !== "HTG") throw new Error("MonCash/NatCash solo permite pagos de salida en HTG.");
  if (!Number.isInteger(amount)) throw new Error("El importe de dispersión debe ser entero en HTG.");
  if (amount < 25) throw new Error("El importe mínimo de dispersión es 25 HTG.");
  if (!/^(509)?\d{8}$/.test(receiver)) throw new Error("El teléfono haitiano debe tener ocho dígitos, opcionalmente con 509.");
  return { network, amount, currency, receiver: receiver.startsWith("509") ? receiver : "509" + receiver };
}

export async function hmacSha256Hex(secret, raw) {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), {name:"HMAC",hash:"SHA-256"}, false, ["sign"]);
  return hex(await crypto.subtle.sign("HMAC", key, typeof raw === "string" ? enc.encode(raw) : raw));
}

export async function verifyHmacSha256(secret, raw, signature) {
  if (!secret || !signature) return false;
  const expected = await hmacSha256Hex(secret, raw);
  return safeEqual(expected.toLowerCase(), String(signature).trim().toLowerCase());
}

export async function verifyStripeSignature(rawBody, header, secret, toleranceSeconds=300) {
  if (!header || !secret) return false;
  const parts = String(header).split(",").map(x=>x.trim());
  const timestamp = Number((parts.find(x=>x.startsWith("t="))||"").slice(2));
  const candidates = parts.filter(x=>x.startsWith("v1=")).map(x=>x.slice(3));
  if (!Number.isInteger(timestamp) || Math.abs(nowSeconds()-timestamp) > toleranceSeconds || !candidates.length) return false;
  const expected = await hmacSha256Hex(secret, String(timestamp) + "." + rawBody);
  return candidates.some(candidate=>safeEqual(expected,candidate));
}

function json(data,status=200,headers={}) {
  return new Response(JSON.stringify(data), {status,headers:{...JSON_HEADERS,...headers}});
}
function corsHeaders(request,env) {
  const origin=request.headers.get("Origin")||"";
  const allow=(env.ALLOWED_ORIGINS||"").split(",").map(x=>x.trim()).filter(Boolean);
  const headers={"Vary":"Origin","Access-Control-Allow-Methods":"GET,POST,OPTIONS","Access-Control-Allow-Headers":"Authorization,Content-Type,Idempotency-Key","Access-Control-Max-Age":"86400"};
  if (allow.includes(origin)) headers["Access-Control-Allow-Origin"]=origin;
  return headers;
}
function pathUrl(base,path) {
  return base.replace(/\/+$/,"") + "/" + path.replace(/^\/+/,"");
}
async function readBody(request,max=30000) {
  const raw=await request.text();
  if (raw.length>max) throw new Error("Solicitud demasiado grande.");
  try { return {raw,data:raw?JSON.parse(raw):{}}; } catch { throw new Error("JSON no válido."); }
}
function bearer(request) {
  const h=request.headers.get("Authorization")||"";
  return h.startsWith("Bearer ")?h.slice(7).trim():"";
}
async function loadFirebaseJwks() {
  if (jwkCache.value && jwkCache.until>Date.now()) return jwkCache.value;
  const response=await fetch(FIREBASE_JWKS,{cf:{cacheTtl:3600}});
  if(!response.ok) throw new Error("No se pudo cargar las llaves públicas de Firebase.");
  const data=await response.json();
  const keys=new Map((data.keys||[]).map(k=>[k.kid,k]));
  jwkCache={value:keys,until:Date.now()+3600000};
  return keys;
}
export async function verifyFirebaseIdToken(token,projectId) {
  const parts=String(token||"").split(".");
  if(parts.length!==3) throw new Error("Token Firebase inválido.");
  const header=JSON.parse(new TextDecoder().decode(fromB64Url(parts[0])));
  const claims=JSON.parse(new TextDecoder().decode(fromB64Url(parts[1])));
  if(header.alg!=="RS256"||!header.kid) throw new Error("Firma Firebase no permitida.");
  const keyData=(await loadFirebaseJwks()).get(header.kid);
  if(!keyData) throw new Error("La llave de firma Firebase no está vigente.");
  const key=await crypto.subtle.importKey("jwk",keyData,{name:"RSASSA-PKCS1-v1_5",hash:"SHA-256"},false,["verify"]);
  const signed=enc.encode(parts[0]+"."+parts[1]);
  const valid=await crypto.subtle.verify("RSASSA-PKCS1-v1_5",key,fromB64Url(parts[2]),signed);
  const now=nowSeconds();
  if(!valid||claims.aud!==projectId||claims.iss!==FIREBASE_TOKEN_ISSUER+projectId||!claims.sub||claims.sub.length>128||!claims.exp||claims.exp<now||claims.iat>now+60||claims.auth_time>now+60) throw new Error("No se pudo autenticar la sesión Firebase.");
  return claims;
}
async function serviceAccount(env) {
  if(!env.FIREBASE_SERVICE_ACCOUNT_JSON) throw new Error("Falta configurar el secreto FIREBASE_SERVICE_ACCOUNT_JSON en Cloudflare.");
  try { return JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_JSON); } catch { throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON no contiene un JSON válido."); }
}
async function firebaseAccessToken(env) {
  if(serviceTokenCache.value && serviceTokenCache.until>Date.now()+60000) return serviceTokenCache.value;
  const account=await serviceAccount(env),now=nowSeconds();
  const b64=(obj)=>toB64Url(enc.encode(JSON.stringify(obj)));
  const head=b64({alg:"RS256",typ:"JWT"});
  const claim=b64({iss:account.client_email,sub:account.client_email,aud:"https://oauth2.googleapis.com/token",iat:now,exp:now+3600,scope:"https://www.googleapis.com/auth/firebase.database https://www.googleapis.com/auth/userinfo.email"});
  const privateKey=String(account.private_key||"").replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g,"");
  if(!privateKey) throw new Error("La cuenta de servicio no tiene private_key.");
  const key=await crypto.subtle.importKey("pkcs8",Uint8Array.from(atob(privateKey),c=>c.charCodeAt(0)),{name:"RSASSA-PKCS1-v1_5",hash:"SHA-256"},false,["sign"]);
  const unsigned=head+"."+claim;
  const sig=await crypto.subtle.sign("RSASSA-PKCS1-v1_5",key,enc.encode(unsigned));
  const assertion=unsigned+"."+toB64Url(sig);
  const response=await fetch("https://oauth2.googleapis.com/token",{method:"POST",headers:{"content-type":"application/x-www-form-urlencoded"},body:new URLSearchParams({grant_type:"urn:ietf:params:oauth:grant-type:jwt-bearer",assertion})});
  const payload=await response.json();
  if(!response.ok||!payload.access_token) throw new Error("No se pudo obtener acceso de servidor a Firebase.");
  serviceTokenCache={value:payload.access_token,until:Date.now()+Number(payload.expires_in||3600)*1000};
  return payload.access_token;
}
async function firebaseRequest(env,path,options={}) {
  const base=(env.FIREBASE_DATABASE_URL||("https://"+env.FIREBASE_PROJECT_ID+"-default-rtdb.firebaseio.com")).replace(/\/+$/,"");
  const token=await firebaseAccessToken(env);
  const split=path.indexOf("?");
  const route=split<0?path:path.slice(0,split);
  const query=split<0?"":path.slice(split+1);
  const url=pathUrl(base,route)+".json"+(query?"?"+query:"");
  const response=await fetch(url,{...options,headers:{...(options.headers||{}),Authorization:"Bearer "+token}});
  const text=await response.text();
  let data=null;try{data=text?JSON.parse(text):null;}catch{}
  if(!response.ok) throw new Error("Firebase devolvió HTTP "+response.status+".");
  return {data,etag:response.headers.get("ETag"),status:response.status};
}
async function getProfile(env,claims) {
  const project=env.FIREBASE_PROJECT_ID;
  if(!project) throw new Error("Falta FIREBASE_PROJECT_ID.");
  if(claims.email && claims.email.toLowerCase()===(env.ADMIN_EMAIL||"ideletteismorin@gmail.com").toLowerCase()) {
    const admin=await firebaseRequest(env,ROOT+"/users/admin");
    if(admin.data) return {key:"admin",data:admin.data};
  }
  const direct=await firebaseRequest(env,ROOT+"/users/"+encodeURIComponent(claims.sub));
  if(direct.data && (direct.data.authUid===claims.sub || direct.data.email===claims.email || direct.data.authEmail===claims.email)) return {key:claims.sub,data:direct.data};
  for(const field of ["authUid","email","authEmail"]) {
    const value=field==="authUid"?claims.sub:claims.email;
    if(!value) continue;
    const query=ROOT+"/users.json?orderBy="+encodeURIComponent('"'+field+'"')+"&equalTo="+encodeURIComponent('"'+value+'"');
    const result=await firebaseRequest(env,query);
    if(result.data && typeof result.data==="object") {
      const first=Object.entries(result.data)[0];
      if(first) return {key:first[0],data:first[1]};
    }
  }
  throw new Error("El usuario autenticado no tiene un perfil SENDWAYO vinculado.");
}
function roleOf(profile) {
  const role=String(profile?.role||profile?.rol||"").toLowerCase();
  if(["admin","administrador","administration"].includes(role)) return "ADMIN";
  if(["agent","agente","agentes"].includes(role)) return "AGENTE";
  if(["remitente","remitentes","sender","remitter"].includes(role)) return "REMITENTE";
  return "";
}
function active(profile) {
  const status=String(profile?.status||profile?.estado||profile?.accountStatus||"").toLowerCase();
  return profile?.active!==false && profile?.activo!==false && profile?.disabled!==true && !["inactive","inactivo","disabled","bloqueado"].includes(status);
}
async function authContext(request,env) {
  const token=bearer(request);
  if(!token) throw new Error("Inicie sesión para continuar.");
  const claims=await verifyFirebaseIdToken(token,env.FIREBASE_PROJECT_ID);
  const profile=await getProfile(env,claims),role=roleOf(profile.data);
  if(!role||!active(profile.data)) throw new Error("La cuenta no tiene un rol activo en SENDWAYO.");
  return {claims,profile,role};
}
function transactionUrl(id) { return ROOT+"/transactions/"+encodeURIComponent(safeKey(id)); }
async function getTransaction(env,id) { return (await firebaseRequest(env,transactionUrl(id))).data; }
async function atomicCreate(env,path,value) {
  const current=await firebaseRequest(env,path,{headers:{"X-Firebase-ETag":"true"}});
  if(current.data!==null && current.data!==undefined) return false;
  const result=await firebaseRequest(env,path,{method:"PUT",headers:{"content-type":"application/json","If-Match":current.etag||"null_etag"},body:JSON.stringify(value)});
  return result.status>=200&&result.status<300;
}
async function atomicUpdate(env,path,patch) {
  const current=await firebaseRequest(env,path,{headers:{"X-Firebase-ETag":"true"}});
  if(!current.data) throw new Error("No existe el registro que desea actualizar.");
  const result=await firebaseRequest(env,path,{method:"PUT",headers:{"content-type":"application/json","If-Match":current.etag||""},body:JSON.stringify({...current.data,...patch})});
  return result.data;
}
async function eventOnce(env,provider,eventId) {
  const key=await hmacSha256Hex(env.FIREBASE_PROJECT_ID||"sendwayo",provider+":"+eventId);
  return atomicCreate(env,ROOT+"/providerEvents/"+provider+"/"+key,{provider,eventId,processedAtMs:Date.now()});
}
function getAppUrl(request,env) {
  const origin=request.headers.get("Origin")||"";
  const allow=(env.ALLOWED_ORIGINS||"").split(",").map(x=>x.trim()).filter(Boolean);
  const base=env.PUBLIC_APP_URL||origin;
  if(!base||(!allow.includes(base)&&!allow.includes(origin))) throw new Error("PUBLIC_APP_URL/ALLOWED_ORIGINS no está configurado para este sitio.");
  return base.replace(/\/+$/,"");
}
function transactionRecord(id,ctx,input,validated,provider,ownerProfile=ctx.profile) {
  const now=Date.now(),owner=ownerProfile?.data||{},actor=ctx.profile?.data||{};
  const operation=clean(input.operationType||"Envío",40),recipient=validated.recipientInfo;
  const beneficiary=clean(recipient.fullName||recipient.name||recipient.phoneOrAccount,120);
  const sender={...validated.senderInfo,fullName:clean(owner.name||owner.nombre||validated.senderInfo.fullName,120),phone:clean(owner.phone||owner.telefono||owner.celular||validated.senderInfo.phone,40),country:validated.countryFrom};
  const sourceText=validated.sourceAmount.toFixed(2)+" "+validated.sourceCurrency;
  return {
    transactionId:id,id,
    userId:owner.authUid||ownerProfile?.key||ctx.claims.sub,
    ownerUserId:ownerProfile?.key||ctx.profile.key,
    type:operation,tipo:operation,
    senderInfo:sender,recipientInfo:recipient,
    paymentDetails:{gateway:provider,sourceCurrency:validated.sourceCurrency,sourceAmount:validated.sourceAmount,totalCharged:validated.totalCharged,feeAmount:money(validated.totalCharged-validated.sourceAmount),status:"creating",providerReference:"",createdAtMs:now},
    payoutDetails:{settlementType:clean(validated.payoutDetails.settlementType||(["MONCASH","NATCASH"].includes(recipient.provider.toUpperCase())?"AGENT_NETWORK":recipient.destinationType==="BANK"?"BANK_TRANSFER":"MERCHANT_PAYMENT"),40).toUpperCase(),agentInfo:validated.payoutDetails.agentInfo||null,targetCurrency:validated.targetCurrency,targetAmount:validated.targetAmount,payoutReference:"",status:"not_started"},
    countryFrom:validated.countryFrom,countryTo:validated.countryTo,route:validated.countryFrom+" -> "+validated.countryTo,
    status:"Pendiente",estado:"Pendiente",reviewStatus:"Pendiente",
    timestamp:now,fecha:new Date(now).toLocaleString("es-DO"),monto:sourceText,montoValue:validated.sourceAmount,moneda:validated.sourceCurrency,fee:money(validated.totalCharged-validated.sourceAmount),
    beneficiario:beneficiary,beneficiarioTel:recipient.phoneOrAccount||"",ruta:validated.countryFrom+" → "+validated.countryTo,rutaExacta:validated.countryFrom+" → "+validated.countryTo+"; "+beneficiary,
    remitenteId:clean(owner.id||owner.staffId||owner.code||ownerProfile?.key),creadorId:clean(actor.id||actor.staffId||actor.code||ctx.profile?.key),
    timestamps:{created:now,updated:now,dispatched:null,completed:null},
    createdByAuthUid:ctx.claims.sub,createdByUserId:ctx.profile.key,createdByRole:ctx.role,createdByUserName:clean(actor.name||actor.nombre,120),
    sinConversionAutomatica:true
  };
}
async function createStripeCheckout(env,tx,appUrl) {
  if(!env.STRIPE_SECRET_KEY) throw new Error("Falta el secreto STRIPE_SECRET_KEY.");
  const accountCountry=normalizeCountry(env.STRIPE_ACCOUNT_COUNTRY);
  if(!isStripeAccountCountrySupported(accountCountry)) throw new Error("Stripe no está habilitado para cuentas comerciales en "+(accountCountry||"el país configurado")+". Configure STRIPE_ACCOUNT_COUNTRY con una entidad legal y una cuenta bancaria válida en un país admitido; que el cliente tenga tarjeta extranjera no elimina este requisito.");
  const amount=amountToMinor(tx.paymentDetails.totalCharged,tx.paymentDetails.sourceCurrency).toString();
  const form=new URLSearchParams({
    mode:"payment",
    success_url:appUrl+"/?sendwayo_payment=return&transactionId="+encodeURIComponent(tx.transactionId)+"&session_id={CHECKOUT_SESSION_ID}",
    cancel_url:appUrl+"/?sendwayo_payment=cancel&transactionId="+encodeURIComponent(tx.transactionId),
    client_reference_id:tx.transactionId,
    "line_items[0][quantity]":"1",
    "line_items[0][price_data][currency]":tx.paymentDetails.sourceCurrency.toLowerCase(),
    "line_items[0][price_data][unit_amount]":amount,
    "line_items[0][price_data][product_data][name]":"SENDWAYO EXPRESS — "+tx.countryFrom+" a "+tx.countryTo,
    "metadata[transactionId]":tx.transactionId,
    "metadata[userId]":tx.userId,
    "metadata[ownerUserId]":tx.ownerUserId
  });
  const response=await fetch(STRIPE_API+"/checkout/sessions",{method:"POST",headers:{Authorization:"Bearer "+env.STRIPE_SECRET_KEY,"content-type":"application/x-www-form-urlencoded"},body:form});
  const data=await response.json();
  if(!response.ok||!data.url) throw new Error("Stripe no pudo crear el Checkout: "+clean(data.error?.message||"respuesta inválida",180));
  return {redirectUrl:data.url,reference:data.id,status:data.payment_status||"unpaid",providerData:{sessionId:data.id}};
}
async function createTranzakPayment(env,tx,input) {
  if(!env.TRANZAK_API_KEY) throw new Error("Falta el secreto TRANZAK_API_KEY.");
  const method=clean(input.paymentMethod||tx.recipientInfo.provider,20).toLowerCase();
  if(!["moncash","natcash"].includes(method)) throw new Error("Tranzak solo está habilitado aquí para MonCash o NatCash.");
  if(tx.paymentDetails.sourceCurrency!=="HTG") throw new Error("MonCash/NatCash cobra en HTG. Para evitar una conversión automática, elija HTG o utilice Stripe para pagar en otra moneda.");
  const body={
    amount:tx.paymentDetails.totalCharged,currency:"HTG",payment_method:method,
    customer_name:tx.senderInfo.fullName,customer_phone:tx.senderInfo.phone,
    reference:tx.transactionId,description:"SENDWAYO "+tx.countryFrom+" a "+tx.countryTo,
    metadata:{transactionId:tx.transactionId,userId:tx.userId,ownerUserId:tx.ownerUserId}
  };
  const response=await fetch(TRANZAK_API+"/payments",{method:"POST",headers:{"X-Api-Key":env.TRANZAK_API_KEY,"content-type":"application/json"},body:JSON.stringify(body)});
  const data=await response.json();
  if(!response.ok||!data.payment_url||String(data.currency).toUpperCase()!=="HTG"||money(data.amount)!==tx.paymentDetails.totalCharged) throw new Error("Tranzak no confirmó importe/moneda exactos: "+clean(data.error||data.message||response.status,160));
  return {redirectUrl:data.payment_url,reference:String(data.transaction_id),status:data.status||"processing",providerData:{transactionId:String(data.transaction_id),paymentMethod:method}};
}
function cardnetBase(env) {
  return (env.CARDNET_API_BASE||((env.CARDNET_MODE||"sandbox")==="production"?"https://ecommerce.cardnet.com.do":"https://labservicios.cardnet.com.do")).replace(/\/+$/,"");
}
async function createCardnetSession(request,env,tx,input,appUrl) {
  if(!env.CARDNET_MERCHANT_NUMBER||!env.CARDNET_MERCHANT_TERMINAL||!env.CARDNET_MERCHANT_NAME) throw new Error("CardNET necesita número de comercio, terminal y nombre de comercio asignados por el adquirente.");
  const currency=tx.paymentDetails.sourceCurrency;
  if(!["DOP","USD"].includes(currency)) throw new Error("CardNET solo se habilitó para DOP o USD.");
  const amount=amountToMinor(tx.paymentDetails.totalCharged,currency);
  const taxValue=Number(input.tax||0);
  const tax=taxValue>0?amountToMinor(taxValue,currency):0;
  const shortId=tx.transactionId.replace(/[^0-9]/g,"").slice(-6).padStart(6,"0");
  const ip=request.headers.get("CF-Connecting-IP")||"0.0.0.0";
  const body={
    TransactionType:"0200",CurrencyCode:currency==="DOP"?"214":"840",
    AcquiringInstitutionCode:env.CARDNET_ACQUIRER_CODE||"349",
    MerchantType:env.CARDNET_MERCHANT_TYPE||"",
    MerchantNumber:env.CARDNET_MERCHANT_NUMBER,
    MerchantTerminal:env.CARDNET_MERCHANT_TERMINAL,
    ReturnUrl:appUrl+"/?sendwayo_cardnet_return=1&transactionId="+encodeURIComponent(tx.transactionId),
    CancelUrl:appUrl+"/?sendwayo_cardnet_cancel=1&transactionId="+encodeURIComponent(tx.transactionId),
    PageLanguaje:"ESP",OrdenID:tx.transactionId.slice(0,20),TransactionId:shortId,
    Tax:String(tax).padStart(12,"0"),Amount:String(amount).padStart(12,"0"),
    MerchantName:clean(env.CARDNET_MERCHANT_NAME,40).toUpperCase(),
    Ipclient:/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)?ip:"0.0.0.0"
  };
  if(env.CARDNET_MERCHANT_TERMINAL_AMEX) body.MerchantTerminal_amex=env.CARDNET_MERCHANT_TERMINAL_AMEX;
  const response=await fetch(cardnetBase(env)+"/sessions",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)});
  const data=await response.json();
  if(!response.ok||!data.SESSION||!data["session-key"]) throw new Error("CardNET no pudo crear una sesión. Verifique afiliación y credenciales.");
  return {
    redirectForm:{action:cardnetBase(env)+"/authorize",method:"POST",fields:{SESSION:data.SESSION}},
    reference:data.SESSION,status:"processing",
    providerData:{session:data.SESSION,shortTransactionId:shortId},privateData:{sessionKey:data["session-key"]}
  };
}
async function createPayment(request,env,ctx,input) {
  if(ctx.role==="AGENTE") throw new Error("Los agentes no pueden iniciar cobros externos desde la cuenta compartida.");
  const validated=validatePaymentInput(input);
  let owner=ctx.profile;
  if(ctx.role==="ADMIN"&&input.ownerUserId) {
    const direct=await firebaseRequest(env,ROOT+"/users/"+encodeURIComponent(input.ownerUserId));
    if(!direct.data) throw new Error("No existe el remitente indicado por Administración.");
    owner={key:input.ownerUserId,data:direct.data};
  }
  const provider=clean(input.provider,20).toLowerCase();
  if(!["stripe","tranzak","cardnet"].includes(provider)) throw new Error("Pasarela no disponible.");
  const id=safeKey(input.transactionId||newId());
  const idempotency=clean(request.headers.get("Idempotency-Key")||input.idempotencyKey,120);
  if(!idempotency) throw new Error("Falta Idempotency-Key.");
  const idemHash=await hmacSha256Hex(env.FIREBASE_PROJECT_ID||"sendwayo",ctx.claims.sub+":"+idempotency);
  const idemPath=ROOT+"/paymentIdempotency/"+ctx.claims.sub+"/"+idemHash;
  const reserved=await atomicCreate(env,idemPath,{transactionId:id,status:"creating",createdAtMs:Date.now()});
  if(!reserved) {
    const prior=(await firebaseRequest(env,idemPath)).data;
    if(prior?.transactionId) {
      const existing=await getTransaction(env,prior.transactionId);
      if(existing) return {transaction:existing,checkout:existing.paymentDetails.checkout||null,reused:true};
      return {transactionId:prior.transactionId,status:"creating",reused:true,retryAfterSeconds:2};
    }
    throw new Error("No se pudo reservar la clave de idempotencia.");
  }
  const tx=transactionRecord(id,ctx,input,validated,provider,owner);
  const created=await atomicCreate(env,transactionUrl(id),tx);
  if(!created) throw new Error("La referencia de transacción ya existe. Use una clave de idempotencia nueva.");
  const appUrl=getAppUrl(request,env);
  try {
    let checkout;
    if(provider==="stripe") checkout=await createStripeCheckout(env,tx,appUrl);
    else if(provider==="tranzak") checkout=await createTranzakPayment(env,tx,input);
    else checkout=await createCardnetSession(request,env,tx,input,appUrl);
    tx.paymentDetails.status="processing";
    tx.paymentDetails.providerReference=checkout.reference;
    tx.paymentDetails.checkout=checkout.redirectUrl?{url:checkout.redirectUrl}:checkout.redirectForm||null;
    tx.paymentDetails.providerData=checkout.providerData||{};
    tx.paymentDetails.updatedAtMs=Date.now();
    tx.timestamps.updated=Date.now();
    if(checkout.privateData) await atomicCreate(env,ROOT+"/paymentPrivate/"+id,checkout.privateData);
    await atomicUpdate(env,transactionUrl(id),tx);
    await atomicUpdate(env,idemPath,{status:"ready",updatedAtMs:Date.now()});
    return {transaction:tx,checkout,reused:false};
  } catch(error) {
    await atomicUpdate(env,transactionUrl(id),{paymentDetails:{...tx.paymentDetails,status:"failed",failureReason:clean(error?.message||"Provider error",250),updatedAtMs:Date.now()},timestamps:{...tx.timestamps,updated:Date.now()}});
    await atomicUpdate(env,idemPath,{status:"failed",error:clean(error?.message||"Provider error",200),updatedAtMs:Date.now()});
    throw error;
  }
}
async function markPayment(env,tx,status,data={}) {
  const latest=await getTransaction(env,tx.transactionId);
  if(!latest) throw new Error("Transacción desaparecida durante la confirmación.");
  const previous=String(latest.paymentDetails?.status||"creating");
  if(previous==="refunded"||(["paid","failed"].includes(previous)&&status!=="refunded")) return latest;
  const patch={
    paymentDetails:{...latest.paymentDetails,status,providerEvent:data.event||latest.paymentDetails.providerEvent||"",providerTransactionId:data.providerTransactionId||latest.paymentDetails.providerTransactionId||"",paidAtMs:status==="paid"?Date.now():latest.paymentDetails.paidAtMs||null,updatedAtMs:Date.now()},
    timestamps:{...latest.timestamps,updated:Date.now()}
  };
  return atomicUpdate(env,transactionUrl(tx.transactionId),patch);
}
async function stripeWebhook(request,env) {
  const raw=await request.text(),sig=request.headers.get("Stripe-Signature")||"";
  if(!await verifyStripeSignature(raw,sig,env.STRIPE_WEBHOOK_SECRET)) return json({error:"Firma Stripe no válida."},400);
  const event=JSON.parse(raw),object=event.data?.object||{};
  const txid=object.metadata?.transactionId||object.client_reference_id;
  if(!txid||!event.id) return json({received:true,ignored:true});
  const eventHash=await hmacSha256Hex(env.FIREBASE_PROJECT_ID||"sendwayo","stripe:"+event.id);
  const eventPath=ROOT+"/providerEvents/stripe/"+eventHash;
  if((await firebaseRequest(env,eventPath)).data) return json({received:true,duplicate:true});
  const tx=await getTransaction(env,txid);
  if(!tx) return json({error:"Transacción no encontrada."},404);
  if(event.type==="checkout.session.completed"||event.type==="checkout.session.async_payment_succeeded") {
    if(object.payment_status!=="paid") return json({received:true,awaitingPayment:true});
    const paidAmount=Number(object.amount_total),expected=amountToMinor(tx.paymentDetails.totalCharged,tx.paymentDetails.sourceCurrency);
    if(paidAmount!==expected||String(object.currency).toUpperCase()!==tx.paymentDetails.sourceCurrency) return json({error:"Importe o moneda Stripe no coinciden."},409);
    await markPayment(env,tx,"paid",{event:event.type,providerTransactionId:object.payment_intent||object.id});
  } else if(event.type==="checkout.session.async_payment_failed") {
    await markPayment(env,tx,"failed",{event:event.type,providerTransactionId:object.payment_intent||object.id});
  }
  await atomicCreate(env,eventPath,{provider:"stripe",eventId:event.id,processedAtMs:Date.now()});
  return json({received:true});
}
async function tranzakWebhook(request,env,isPayout=false) {
  const raw=await request.text(),signature=request.headers.get("X-Tranzak-Signature")||"",secret=isPayout?env.TRANZAK_PAYOUT_WEBHOOK_SECRET:env.TRANZAK_WEBHOOK_SECRET;
  if(!await verifyHmacSha256(secret,raw,signature)) return json({error:"Firma Tranzak no válida."},403);
  const event=JSON.parse(raw),data=event.data||{},eventType=clean(event.event||request.headers.get("X-Tranzak-Event"),60);
  const reference=clean(data.reference||data.payout_reference,180);
  if(!reference) return json({received:true,ignored:true});
  const eventKey=eventType+":"+(data.transaction_id||data.payout_id||reference);
  const eventHash=await hmacSha256Hex(env.FIREBASE_PROJECT_ID||"sendwayo",eventKey);
  const provider=isPayout?"tranzak-payout":"tranzak-payment",eventPath=ROOT+"/providerEvents/"+provider+"/"+eventHash;
  if((await firebaseRequest(env,eventPath)).data) return json({received:true,duplicate:true});
  let transactionId=reference;
  if(isPayout){
    const referenceHash=await hmacSha256Hex(env.FIREBASE_PROJECT_ID||"sendwayo","tranzak-payout-reference:"+reference);
    const mapped=(await firebaseRequest(env,ROOT+"/payoutReferenceLookup/"+referenceHash)).data;
    if(mapped?.transactionId) transactionId=mapped.transactionId;
  }
  const tx=await getTransaction(env,transactionId);
  if(!tx) return json({error:"Transacción no encontrada."},404);
  if(isPayout){
    const status=eventType==="payout.completed"?"completed":eventType==="payout.failed"?"failed":"processing";
    const latest=await getTransaction(env,transactionId);
    const payoutDetails={...latest.payoutDetails,status,providerReference:data.payout_id||latest.payoutDetails.payoutReference,fee:Number(data.fee||0),totalDebited:Number(data.total_debited||0),failureCode:data.failure_code||data.failure_reason||"",refunded:data.refund_status==="refunded",completedAtMs:data.completed_at?Date.parse(data.completed_at):null,updatedAtMs:Date.now()};
    const patch={payoutDetails,timestamps:{...latest.timestamps,updated:Date.now(),dispatched:latest.timestamps.dispatched||Date.now(),completed:status==="completed"?Date.now():latest.timestamps.completed}};
    if(status==="completed") Object.assign(patch,{status:"Completado",estado:"Completado",reviewStatus:"Aprobado"});
    await atomicUpdate(env,transactionUrl(transactionId),patch);
  }else{
    if(data.currency&&String(data.currency).toUpperCase()!==tx.paymentDetails.sourceCurrency) return json({error:"La moneda del webhook no coincide."},409);
    if(data.amount!=null&&money(data.amount)!==tx.paymentDetails.totalCharged) return json({error:"El importe del webhook no coincide."},409);
    if(eventType==="payment.success") await markPayment(env,tx,"paid",{event:eventType,providerTransactionId:data.transaction_id});
    else if(eventType==="payment.failed"||eventType==="payment.refunded") await markPayment(env,tx,eventType==="payment.refunded"?"refunded":"failed",{event:eventType,providerTransactionId:data.transaction_id});
  }
  await atomicCreate(env,eventPath,{provider,eventId:eventKey,transactionId,processedAtMs:Date.now()});
  return json({received:true});
}
async function confirmCardnet(request,env,ctx,txid) {
  const tx=await getTransaction(env,txid);
  if(!tx) return json({error:"Transacción no encontrada."},404);
  if(ctx.role!=="ADMIN"&&tx.userId!==ctx.claims.sub) return json({error:"No tiene permiso para consultar esta transacción."},403);
  if(tx.paymentDetails?.gateway!=="cardnet") return json({error:"Esta transacción no es CardNET."},400);
  const p=tx.paymentDetails.providerData||{};
  const privateData=(await firebaseRequest(env,ROOT+"/paymentPrivate/"+encodeURIComponent(txid))).data||{};
  if(!p.session||!privateData.sessionKey) return json({error:"Falta la sesión privada CardNET."},409);
  const response=await fetch(cardnetBase(env)+"/sessions/"+encodeURIComponent(p.session)+"?sk="+encodeURIComponent(privateData.sessionKey));
  const data=await response.json();
  if(!response.ok) return json({error:"CardNET no devolvió el resultado de la transacción."},502);
  if(String(data.TransactionID||data.TransactionId||"")!==String(p.shortTransactionId||"")) return json({error:"La referencia devuelta por CardNET no coincide con la transacción."},409);
  if(data.ResponseCode==="00"&&String(data.RemoteResponseCode||"00")==="00") {
    await markPayment(env,tx,"paid",{event:"cardnet.server-verification",providerTransactionId:data.RetrievalReferenceNumber||data.TransactionID});
    return json({status:"paid",reference:data.RetrievalReferenceNumber||"",transactionId:txid});
  }
  if(data.ResponseCode&&data.ResponseCode!=="09") await markPayment(env,tx,"failed",{event:"cardnet.server-verification"});
  return json({status:data.ResponseCode==="09"?"processing":"failed",responseCode:data.ResponseCode||"unknown"},200);
}
async function reviewTransaction(request,env,ctx,body) {
  const id=safeKey(body.transactionId),tx=await getTransaction(env,id);
  if(!tx) return json({error:"Transacción no encontrada."},404);
  const action=clean(body.action,30).toLowerCase(),reason=clean(body.reason,500);
  const isOwn=tx.createdByAuthUid===ctx.claims.sub;
  const isDeposit=/dep[oó]sit/i.test(clean(tx.type||tx.tipo||tx.paymentDetails?.type||""))||clean(tx.recipientInfo?.destinationType).toLowerCase()==="deposit";
  if(!["approve","reject","no_match"].includes(action)) return json({error:"Acción no válida."},400);
  if(ctx.role==="REMITENTE") return json({error:"El remitente no puede revisar transacciones."},403);
  if(ctx.role==="AGENTE"&&(isOwn||isDeposit||tx.createdByRole==="ADMIN")) return json({error:"El agente no puede revisar esta transacción."},403);
  if(ctx.role!=="ADMIN"&&ctx.role!=="AGENTE") return json({error:"Rol no autorizado."},403);
  if(action!=="approve"&&!reason) return json({error:"Debe indicar un motivo o instrucciones."},400);
  const currentReview=clean(tx.reviewStatus||tx.status);
  if(["Aprobado","Rechazado","Completado"].includes(currentReview)||tx.payoutDetails?.status==="completed") return json({error:"La transacción ya fue resuelta."},409);
  if(action==="approve"&&tx.paymentDetails?.gateway&&tx.paymentDetails.status!=="paid") return json({error:"El pago aún no está confirmado por el proveedor."},409);
  const status=action==="approve"?"Aprobado":action==="reject"?"Rechazado":"No coincide";
  const patch={
    status,reviewStatus:status,reviewReason:action==="reject"?reason:"",noMatchInstructions:action==="no_match"?reason:"",
    reviewedBy:{uid:ctx.claims.sub,role:ctx.role,name:clean(ctx.profile.data.name||ctx.profile.data.nombre,120),at:Date.now()},
    timestamps:{...tx.timestamps,updated:Date.now()}
  };
  await atomicUpdate(env,transactionUrl(id),patch);
  return json({transactionId:id,status});
}
async function claimPayoutDispatch(env,id,actorUid) {
  const path=transactionUrl(id);
  const current=await firebaseRequest(env,path,{headers:{"X-Firebase-ETag":"true"}});
  const tx=current.data;
  if(!tx||clean(tx.reviewStatus||tx.status)!=="Aprobado") throw new Error("La transacción no está aprobada.");
  if(["processing","pending","completed","dispatching","outcome_unknown","manual_pending"].includes(tx.payoutDetails?.status)) throw new Error("La dispersión ya fue iniciada o está pendiente.");
  if(tx.payoutDetails?.status==="failed"&&!tx.payoutDetails?.refunded) throw new Error("El proveedor no ha confirmado la devolución. No se puede reintentar.");
  const next={...tx,payoutDetails:{...tx.payoutDetails,status:"dispatching",startedAtMs:Date.now(),startedBy:actorUid},timestamps:{...tx.timestamps,updated:Date.now()}};
  await firebaseRequest(env,path,{method:"PUT",headers:{"content-type":"application/json","If-Match":current.etag||""},body:JSON.stringify(next)});
  return next;
}
async function dispatchPayout(request,env,ctx,body) {
  if(ctx.role!=="ADMIN") return json({error:"Solo Administración puede dispersar fondos."},403);
  const id=safeKey(body.transactionId),tx=await getTransaction(env,id);
  if(!tx) return json({error:"Transacción no encontrada."},404);
  if(clean(tx.reviewStatus||tx.status)!=="Aprobado") return json({error:"Solo se dispersan operaciones aprobadas por Administración."},409);
  if(tx.paymentDetails?.gateway&&tx.paymentDetails.status!=="paid") return json({error:"El pago de origen no está confirmado."},409);
  const settle=clean(tx.payoutDetails?.settlementType||"",40).toUpperCase();
  if(settle==="AGENT_NETWORK") {
    const agent=tx.payoutDetails?.agentInfo||{};
    const payout=validatePayoutInput({network:agent.network||tx.recipientInfo?.provider,targetAmount:tx.payoutDetails.targetAmount,targetCurrency:tx.payoutDetails.targetCurrency,receiver:tx.recipientInfo?.phoneOrAccount});
    if(!env.TRANZAK_API_KEY) return json({error:"Falta TRANZAK_API_KEY; la dispersión no se envió."},503);
    const priorReference=clean(tx.payoutDetails?.payoutReference,90);
    const ref=clean(body.payoutReference,90)||(priorReference?tx.transactionId+"-"+Date.now():tx.transactionId);
    if(!/^[A-Za-z0-9._-]{4,100}$/.test(ref)) return json({error:"Referencia de dispersión no válida."},400);
    const referenceHash=await hmacSha256Hex(env.FIREBASE_PROJECT_ID||"sendwayo","tranzak-payout-reference:"+ref);
    const api=TRANZAK_TREASURY+"/payouts";
    try { await claimPayoutDispatch(env,id,ctx.claims.sub); }
    catch(error) { return json({error:error.message||"No se pudo bloquear la dispersión."},409); }
    await atomicCreate(env,ROOT+"/payoutReferenceLookup/"+referenceHash,{transactionId:id,reference:ref,createdAtMs:Date.now()});
    let sendStarted=false;
    try {
      const authResponse=await fetch(api+"/authorize",{method:"POST",headers:{"X-API-Key":env.TRANZAK_API_KEY,"content-type":"application/json"},body:JSON.stringify({amount:payout.amount,network:payout.network,receiver:payout.receiver,reference:ref,description:"SENDWAYO "+id})});
      const authData=await authResponse.json();
      const authorizationToken=authData.authorization?.authorization_token;
      if(!authResponse.ok||!authorizationToken) throw new Error(clean(authData.error||authData.message||"Tranzak rechazó la autorización.",180));
      sendStarted=true;
      const sendResponse=await fetch(api,{method:"POST",headers:{"X-API-Key":env.TRANZAK_API_KEY,"content-type":"application/json"},body:JSON.stringify({authorization_token:authorizationToken})});
      const sent=await sendResponse.json();
      if(!sendResponse.ok||!sent.payout) throw new Error("La respuesta de envío de Tranzak no permite confirmar el resultado.");
      const latest=await getTransaction(env,id),status=sent.payout.status||"processing";
      await atomicUpdate(env,transactionUrl(id),{payoutDetails:{...latest.payoutDetails,status,payoutReference:ref,providerReference:sent.payout.payout_id,network:payout.network,fee:Number(sent.payout.fee||0),totalDebited:Number(sent.payout.total_debited||0),startedAtMs:latest.payoutDetails.startedAtMs||Date.now()},timestamps:{...latest.timestamps,updated:Date.now(),dispatched:Date.now()}});
      return json({transactionId:id,payout:sent.payout});
    } catch(error) {
      const latest=await getTransaction(env,id);
      const uncertain=sendStarted;
      await atomicUpdate(env,transactionUrl(id),{payoutDetails:{...latest.payoutDetails,status:uncertain?"outcome_unknown":"failed_authorization",payoutReference:ref,warning:uncertain?"Verifique el estado con Tranzak antes de volver a intentar.":clean(error?.message||"Autorización rechazada",180)},timestamps:{...latest.timestamps,updated:Date.now()}});
      return json({error:uncertain?"El resultado del envío no es concluyente. La operación quedó bloqueada para impedir un doble pago.":clean(error?.message||"Tranzak rechazó la autorización.",180)},502);
    }
  }
  if(["BANK","BANK_TRANSFER","MERCHANT","MERCHANT_PAYMENT"].includes(settle)) {
    try { await claimPayoutDispatch(env,id,ctx.claims.sub); } catch(error) { return json({error:error.message||"No se pudo bloquear la orden."},409); }
    const latest=await getTransaction(env,id);
    await atomicUpdate(env,transactionUrl(id),{payoutDetails:{...latest.payoutDetails,status:"manual_pending",manualDispatch:{createdBy:ctx.claims.sub,createdAtMs:Date.now(),reason:"No existe un adaptador bancario/comercial contratado y configurado."}},timestamps:{...latest.timestamps,updated:Date.now()}});
    return json({transactionId:id,status:"manual_pending",message:"Orden creada para dispersión manual. No se ha enviado dinero al banco o comercio."});
  }
  return json({error:"Tipo de dispersión no soportado o no contratado."},400);
}
async function completeManualPayout(request,env,ctx,body) {
  if(ctx.role!=="ADMIN") return json({error:"Solo Administración puede cerrar una dispersión manual."},403);
  const id=safeKey(body.transactionId),reference=clean(body.payoutReference,120),proof=clean(body.proofReference||body.proofUrl,500);
  if(!reference||!proof) return json({error:"Se exige referencia de banco/comercio y evidencia del comprobante."},400);
  const tx=await getTransaction(env,id);if(!tx) return json({error:"Transacción no encontrada."},404);
  if(tx.payoutDetails?.status!=="manual_pending") return json({error:"La operación no está en espera de dispersión manual."},409);
  await atomicUpdate(env,transactionUrl(id),{status:"Completado",estado:"Completado",reviewStatus:"Aprobado",payoutDetails:{...tx.payoutDetails,status:"completed",payoutReference:reference,manualDispatch:{...tx.payoutDetails.manualDispatch,completedBy:ctx.claims.sub,completedAtMs:Date.now(),proofReference:proof}},timestamps:{...tx.timestamps,updated:Date.now(),completed:Date.now()}});
  return json({transactionId:id,status:"completed",payoutReference:reference});
}
async function getTransactionForUser(env,ctx,id) {
  const tx=await getTransaction(env,id);if(!tx) return null;
  if(ctx.role==="ADMIN"||tx.userId===ctx.claims.sub) return tx;
  if(ctx.role==="AGENTE"&&tx.status==="Pendiente") return tx;
  return null;
}

export default {
  async fetch(request,env,ctx) {
    const cors=corsHeaders(request,env);
    if(request.method==="OPTIONS") return new Response(null,{status:204,headers:cors});
    const url=new URL(request.url),path=url.pathname;
    try {
      if(path==="/health"&&request.method==="GET") return json({ok:true,worker:"sendwayo-express-payments-v7",time:Date.now()},200,cors);
      if(path==="/api/verify"&&request.method==="POST") {
        const token=bearer(request);
        const claims=await verifyFirebaseIdToken(token,env.FIREBASE_PROJECT_ID);
        const profile=await getProfile(env,claims),role=roleOf(profile.data);
        if(!role||!active(profile.data)) return json({valid:false,error:"Cuenta SENDWAYO inactiva o sin rol."},403,cors);
        return json({valid:true,user:{uid:claims.sub,email:claims.email||"",role,profileKey:profile.key}},200,cors);
      }
      if(path==="/api/webhooks/stripe"&&request.method==="POST") return await stripeWebhook(request,env).then(r=>withCors(r,cors));
      if(path==="/api/webhooks/tranzak"&&request.method==="POST") return await tranzakWebhook(request,env,false).then(r=>withCors(r,cors));
      if(path==="/api/webhooks/tranzak-payout"&&request.method==="POST") return await tranzakWebhook(request,env,true).then(r=>withCors(r,cors));
      const ctxUser=await authContext(request,env);
      if(path==="/api/payments/checkout"&&request.method==="POST") {
        const {data}=await readBody(request);const result=await createPayment(request,env,ctxUser,data);
        return json({ok:true,...result},201,cors);
      }
      if(path==="/api/payments/cardnet/confirm"&&request.method==="POST") {
        const {data}=await readBody(request);const response=await confirmCardnet(request,env,ctxUser,data.transactionId);
        return withCors(response,cors);
      }
      if(path==="/api/transactions/review"&&request.method==="POST") {
        const {data}=await readBody(request);return await reviewTransaction(request,env,ctxUser,data).then(r=>withCors(r,cors));
      }
      if(path==="/api/payouts/dispatch"&&request.method==="POST") {
        const {data}=await readBody(request);return await dispatchPayout(request,env,ctxUser,data).then(r=>withCors(r,cors));
      }
      if(path==="/api/payouts/manual/complete"&&request.method==="POST") {
        const {data}=await readBody(request);return await completeManualPayout(request,env,ctxUser,data).then(r=>withCors(r,cors));
      }
      const match=path.match(/^\/api\/transactions\/([A-Za-z0-9_-]+)$/);
      if(match&&request.method==="GET") {
        const tx=await getTransactionForUser(env,ctxUser,match[1]);
        return tx?json({transaction:tx},200,cors):json({error:"No tiene permiso para ver esta transacción."},403,cors);
      }
      return json({error:"Ruta no encontrada."},404,cors);
    } catch(error) {
      const message=clean(error?.message||"Error interno.",300);
      const status=/Inicie sesión|Token Firebase|autenticar|permiso|no tiene permiso/i.test(message)?401:/Falta configurar|Falta el secreto/.test(message)?503:/no tiene|no puede|Solo Administración|Solo el administrador/.test(message)?403:400;
      return json({error:message},status,cors);
    }
  }
};
function withCors(response,headers) {
  const merged=new Headers(response.headers);
  for(const [key,value] of Object.entries(headers)) merged.set(key,value);
  return new Response(response.body,{status:response.status,statusText:response.statusText,headers:merged});
}
