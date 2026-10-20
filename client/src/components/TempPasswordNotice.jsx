import { useToast } from '../context/ToastContext';

// Shown once, right after an owner adds an employee or rider: the server made a
// temporary password and this is the only time it can be read.
export default function TempPasswordNotice({ created, onDone }) {
  const toast = useToast();
  if (!created) return null;

  async function copy() {
    try {
      await navigator.clipboard.writeText(created.tempPassword);
      toast('Temporary password copied.');
    } catch {
      toast('Could not copy. Select the password and copy it manually.', { type: 'error' });
    }
  }

  return (
    <div className="message success temp-pass">
      <strong>{created.name} was added.</strong>
      <p>
        Give them this temporary password. It is shown only once, so copy it now. They log in with{' '}
        <strong>{created.email}</strong> and will be asked to choose their own password.
      </p>
      <div className="temp-pass-row">
        <code>{created.tempPassword}</code>
        <button type="button" className="btn-ghost small" onClick={copy}>Copy</button>
        <button type="button" className="link-btn" onClick={onDone}>Done</button>
      </div>
    </div>
  );
}
