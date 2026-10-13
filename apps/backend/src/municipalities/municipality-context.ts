// The municipality a request is working in, resolved from :slug by
// MunicipalityGuard and read with @CurrentMunicipality().
export interface MunicipalityContext {
  id: number;
  slug: string;
  name: string;
  state: string;
  daneCode: string;
}
