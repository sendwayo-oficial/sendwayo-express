# Catálogo internacional de países SENDWAYO

El catálogo local integrado contiene 250 códigos ISO 3166-1 alpha-2 de países y territorios. Incluye nombre, prefijo telefónico E.164 cuando está asignado y bandera emoji. La República Dominicana conserva su asignación base +1-809 y el selector existente ofrece además +1-829 y +1-849.

**Fuente del conjunto de datos:** [ProgrammerNomad/CountryKit](https://github.com/ProgrammerNomad/CountryKit), archivo `data/countries.min.json`, licencia MIT. Los dos territorios sin prefijo telefónico asignado en la fuente se conservan en el listado; el formulario no permite generar un teléfono E.164 inventado para ellos.

El catálogo se mantiene tanto como recurso versionado en `data/sendwayo-countries-v1.min.json` como dentro del HTML para que el listado inicial no dependa de una descarga externa. La consulta remota opcional puede actualizar el catálogo después, pero no es necesaria para mostrar los países cuando la conexión falla.

Incluye el aviso de copyright y permiso MIT en `docs/licenses/COUNTRYKIT-MIT-LICENSE.txt`.
