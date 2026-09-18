import { useState } from "react";
import type { FormEvent } from "react";
import { Button } from "../../components/ui/Button";
import { GeneratePdfDialog } from "../../components/ui/GeneratePdfDialog";
import { Input } from "../../components/ui/Input";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { Table } from "../../components/ui/Table";
import { TableRow } from "../../components/ui/TableRow";
import "./LiquidacionesPage.css";

type LiquidacionEstado = "Vencida" | "Pendiente" | "En revisión" | "Procesada";

interface LiquidacionFixtureEntry {
  cedulaCatastral: string;
  propietario: string;
  // La dirección no se muestra como columna en el mockup, pero sí es uno de
  // los 3 criterios de búsqueda -- se guarda igual en el fixture para poder
  // filtrar por ella en el cliente.
  direccion: string;
  periodo: string;
  estado: LiquidacionEstado;
}

const ESTADO_VARIANT: Record<
  LiquidacionEstado,
  "success" | "warning" | "danger"
> = {
  Vencida: "danger",
  Pendiente: "warning",
  "En revisión": "warning",
  Procesada: "success",
};

// Datos de fixture para desarrollo -- NO son datos reales de contribuyentes.
// Sirven solo para ver la tabla de resultados con contenido mientras HU14
// no expone un endpoint real de búsqueda de liquidaciones.
const FIXTURE_LIQUIDACIONES: LiquidacionFixtureEntry[] = [
  {
    cedulaCatastral: "041-01-0023-000",
    propietario: "María Fernanda Ríos",
    direccion: "Calle 45 # 12-30",
    periodo: "2022 - 2024",
    estado: "Vencida",
  },
  {
    cedulaCatastral: "041-01-0087-002",
    propietario: "Carlos Andrés Gómez",
    direccion: "Carrera 8 # 20-15",
    periodo: "2024",
    estado: "Pendiente",
  },
  {
    cedulaCatastral: "041-02-0011-010",
    propietario: "Inversiones El Roble S.A.S.",
    direccion: "Avenida 30 # 45-10",
    periodo: "2023 - 2024",
    estado: "Vencida",
  },
  {
    cedulaCatastral: "041-02-0155-004",
    propietario: "Luz Marina Torres",
    direccion: "Calle 10 # 5-22",
    periodo: "2024",
    estado: "En revisión",
  },
  {
    cedulaCatastral: "041-03-0002-000",
    propietario: "José Manuel Ortiz",
    direccion: "Transversal 6 # 18-40",
    periodo: "2021 - 2024",
    estado: "Vencida",
  },
];

interface Filters {
  cedulaCatastral: string;
  propietario: string;
  direccion: string;
}

const EMPTY_FILTERS: Filters = {
  cedulaCatastral: "",
  propietario: "",
  direccion: "",
};

export function LiquidacionesPage() {
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [results, setResults] = useState<LiquidacionFixtureEntry[]>(
    FIXTURE_LIQUIDACIONES,
  );
  const [selectedCedula, setSelectedCedula] = useState<string | null>(null);
  const [pdfDialogLiquidacion, setPdfDialogLiquidacion] =
    useState<LiquidacionFixtureEntry | null>(null);
  const [isPdfDialogOpen, setIsPdfDialogOpen] = useState(false);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);

  function handleFilterChange(field: keyof Filters, value: string) {
    setFilters((current) => ({ ...current, [field]: value }));
  }

  function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    // TODO(SL-53): conectar con el endpoint real de busqueda de HU14 cuando
    // el contrato esté confirmado. Por ahora solo filtra, en el cliente, el
    // listado de fixture ya cargado -- no se inventa la forma de esa
    // respuesta del backend.
    const cedula = filters.cedulaCatastral.trim().toLowerCase();
    const propietario = filters.propietario.trim().toLowerCase();
    const direccion = filters.direccion.trim().toLowerCase();

    const next = FIXTURE_LIQUIDACIONES.filter((entry) => {
      const matchesCedula =
        cedula === "" || entry.cedulaCatastral.toLowerCase().includes(cedula);
      const matchesPropietario =
        propietario === "" ||
        entry.propietario.toLowerCase().includes(propietario);
      const matchesDireccion =
        direccion === "" || entry.direccion.toLowerCase().includes(direccion);
      return matchesCedula && matchesPropietario && matchesDireccion;
    });

    setResults(next);
    setSelectedCedula(null);
  }

  function handleRowClick(entry: LiquidacionFixtureEntry) {
    setSelectedCedula(entry.cedulaCatastral);
    setPdfDialogLiquidacion(entry);
    setIsPdfDialogOpen(true);
  }

  function handleCancelPdfDialog() {
    setIsPdfDialogOpen(false);
  }

  function handleGeneratePdf() {
    setIsGeneratingPdf(true);
    // TODO(SL-53): conectar con el endpoint real de HU14 para generar y
    // descargar el PDF cuando se confirme el contrato -- no inventar la
    // forma de esa respuesta, no implementar descarga real de ningún
    // archivo. El setTimeout de abajo solo simula la carga en el cliente.
    setTimeout(() => {
      setIsGeneratingPdf(false);
      setIsPdfDialogOpen(false);
    }, 700);
  }

  return (
    <div className="liquidaciones-page">
      <header className="liquidaciones-page__header">
        <h1 className="liquidaciones-page__title">Panel de liquidaciones</h1>
        <p className="liquidaciones-page__subtitle">
          Consulta, filtra y genera las liquidaciones oficiales del predio.
        </p>
      </header>

      <section className="liquidaciones-page__card">
        <h2 className="liquidaciones-page__card-title">Filtros de búsqueda</h2>
        <p className="liquidaciones-page__card-subtitle">
          Al menos un criterio permite ubicar las liquidaciones del predio.
        </p>

        <form className="liquidaciones-page__filters" onSubmit={handleSearch}>
          <div className="liquidaciones-page__filter-field">
            <Input
              label="Cédula catastral"
              placeholder="000-00-0000-000"
              value={filters.cedulaCatastral}
              onChange={(event) =>
                handleFilterChange("cedulaCatastral", event.target.value)
              }
            />
          </div>
          <div className="liquidaciones-page__filter-field">
            <Input
              label="Propietario"
              placeholder="Nombre del propietario"
              value={filters.propietario}
              onChange={(event) =>
                handleFilterChange("propietario", event.target.value)
              }
            />
          </div>
          <div className="liquidaciones-page__filter-field">
            <Input
              label="Dirección del predio"
              placeholder="Calle 00 # 00-00"
              value={filters.direccion}
              onChange={(event) =>
                handleFilterChange("direccion", event.target.value)
              }
            />
          </div>
          <div className="liquidaciones-page__filter-action">
            <Button type="submit">Buscar</Button>
          </div>
        </form>
      </section>

      <section className="liquidaciones-page__card">
        <h2 className="liquidaciones-page__card-title">Resultados</h2>
        <p className="liquidaciones-page__card-subtitle">
          {results.length} liquidaciones encontradas para los criterios
          ingresados.
        </p>

        <Table
          columns={["Cédula catastral", "Propietario", "Periodo", "Estado"]}
        >
          {results.map((entry) => (
            <TableRow
              key={entry.cedulaCatastral}
              selected={entry.cedulaCatastral === selectedCedula}
              onClick={() => handleRowClick(entry)}
              cells={[
                entry.cedulaCatastral,
                entry.propietario,
                entry.periodo,
                <StatusBadge
                  key="estado"
                  variant={ESTADO_VARIANT[entry.estado]}
                >
                  {entry.estado}
                </StatusBadge>,
              ]}
            />
          ))}
        </Table>
      </section>

      <GeneratePdfDialog
        open={isPdfDialogOpen}
        liquidacion={pdfDialogLiquidacion}
        isGenerating={isGeneratingPdf}
        onCancel={handleCancelPdfDialog}
        onGenerate={handleGeneratePdf}
      />
    </div>
  );
}
