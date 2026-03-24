import { Modal, ModalHeader, ModalBody, ModalFooter } from './Modal';
import { Button } from './Button';

interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmLabel?: string;
  variant?: 'danger' | 'warning' | 'primary';
  loading?: boolean;
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = 'Confirm',
  variant = 'danger',
  loading = false,
}: ConfirmDialogProps) {
  return (
    <Modal open={open} onClose={onClose} size="sm">
      <ModalHeader onClose={onClose}>{title}</ModalHeader>
      <ModalBody>
        <p className="text-sm text-zinc-400">{message}</p>
      </ModalBody>
      <ModalFooter>
        <Button variant="ghost" onClick={onClose} disabled={loading}>
          Cancel
        </Button>
        <Button variant={variant} onClick={onConfirm} disabled={loading}>
          {loading ? 'Processing...' : confirmLabel}
        </Button>
      </ModalFooter>
    </Modal>
  );
}
