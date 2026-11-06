import { request } from "./httpClient";

// The municipalities the super user operates (SL-122, SL-123). There is no
// delete: a municipality with data is never removed.
export interface Municipality {
  id: number;
  slug: string;
  name: string;
  state: string;
  daneCode: string;
}

export interface NewMunicipality {
  name: string;
  state: string;
  daneCode: string;
  slug: string;
}

// Sorted by name and department, as the selector shows them.
export function listMunicipalities(
  signal?: AbortSignal,
): Promise<Municipality[]> {
  return request("/municipalities", { signal });
}

export function createMunicipality(
  municipality: NewMunicipality,
): Promise<Municipality> {
  return request("/municipalities", { method: "POST", body: municipality });
}
