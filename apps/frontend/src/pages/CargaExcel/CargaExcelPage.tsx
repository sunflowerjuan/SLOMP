import { useState } from "react";
import { Button } from "../../components/ui/Button";
import { Dropzone } from "../../components/ui/Dropzone";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { Table } from "../../components/ui/Table";
import { TableRow } from "../../components/ui/TableRow";
import "./CargaExcelPage.css";

interface UploadHistoryEntry {
  archivo: string;
  fechaDeCarga: string;
  registros: string;
  estado: "procesado";
}

// Datos de fixture para desarrollo -- NO son datos reales del sistema.
// Sirven solo para ver la tabla de historial con contenido mientras HU12
// no expone un endpoint real de historial de cargas.
const FIXTURE_UPLOAD_HISTORY: UploadHistoryEntry[] = [
  {
    archivo: "periodo_2024_Q1.xlsx",
    fechaDeCarga: "14/03/2024",
    registros: "812",
    estado: "procesado",
  },
  {
    archivo: "periodo_2023_mora.xlsx",
    fechaDeCarga: "02/02/2024",
    registros: "1.204",
    estado: "procesado",
  },
  {
    archivo: "periodo_2024_Q2.xlsx",
    fechaDeCarga: "01/07/2024",
    registros: "798",
    estado: "procesado",
  },
];

export function CargaExcelPage() {
  const [file, setFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  function handleProcess() {
    if (!file) {
      return;
    }

    setIsProcessing(true);
    // TODO(SL-52): conectar con el endpoint real de HU12 cuando el contrato
    // esté confirmado; mostrar ReplaceConfirmDialog (components/ui) cuando
    // el backend reporte alerta de reemplazo (HU18).
    setIsProcessing(false);
  }

  return (
    <div className="carga-excel-page">
      <header className="carga-excel-page__header">
        <h1 className="carga-excel-page__title">Carga de archivo Excel</h1>
        <p className="carga-excel-page__subtitle">
          Sube el Excel con la información de predios y deudas para generar las
          liquidaciones del periodo actual.
        </p>
      </header>

      <section className="carga-excel-page__card">
        <h2 className="carga-excel-page__card-title">Nueva carga</h2>
        <p className="carga-excel-page__card-subtitle">
          Cada predio y periodo solo puede liquidarse una vez. Si el periodo ya
          fue liquidado, el sistema te avisará antes de reemplazarlo.
        </p>

        <Dropzone
          file={file}
          onFileSelect={setFile}
          onClear={() => setFile(null)}
        />

        <div className="carga-excel-page__actions">
          <Button
            type="button"
            disabled={!file}
            loading={isProcessing}
            onClick={handleProcess}
          >
            Procesar archivo
          </Button>
        </div>
      </section>

      <section className="carga-excel-page__card">
        <h2 className="carga-excel-page__card-title">Historial de cargas</h2>
        <p className="carga-excel-page__card-subtitle">
          Últimos archivos procesados por el sistema.
        </p>

        <Table columns={["Archivo", "Fecha de carga", "Registros", "Estado"]}>
          {FIXTURE_UPLOAD_HISTORY.map((entry) => (
            <TableRow
              key={entry.archivo}
              cells={[
                entry.archivo,
                entry.fechaDeCarga,
                entry.registros,
                <StatusBadge key="estado" variant="success">
                  Procesado
                </StatusBadge>,
              ]}
            />
          ))}
        </Table>
      </section>
    </div>
  );
}
