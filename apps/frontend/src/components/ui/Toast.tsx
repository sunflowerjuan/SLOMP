import "./Toast.css";

interface ToastProps {
  message: string | null;
}

// Always mounted so screen readers pick up the text when it changes.
export function Toast({ message }: ToastProps) {
  return (
    <div className="ui-toast" data-visible={Boolean(message)} role="status">
      {message}
    </div>
  );
}
