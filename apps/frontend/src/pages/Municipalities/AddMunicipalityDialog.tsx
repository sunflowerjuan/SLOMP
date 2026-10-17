import { useState } from "react";
import type { Municipality } from "../../api/municipalities";
import { Dialog } from "../../components/ui/Dialog";
import { AddMunicipalityForm } from "./AddMunicipalityForm";

interface AddMunicipalityDialogProps {
  open: boolean;
  onClose: () => void;
  onCreated: (municipality: Municipality) => void;
}

// Name, department, DANE code and a suggested slug (SL-122, section 7).
export function AddMunicipalityDialog({
  open,
  onClose,
  onCreated,
}: AddMunicipalityDialogProps) {
  const [busy, setBusy] = useState(false);

  return (
    <Dialog
      open={open}
      title="Agregar municipio"
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <AddMunicipalityForm
        onCancel={onClose}
        onCreated={onCreated}
        onBusyChange={setBusy}
      />
    </Dialog>
  );
}
