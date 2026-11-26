import { useState } from 'react';
import { useServices } from '@/app/services';
import { useUiStore } from '@/app/uiStore';
import { t } from '@/i18n';
import { Button } from '@/ui';
import { joinPastedInvite } from './joinInvite';

/** "I have a gym invite link": paste the link inside the installed app. Calls `onJoined` after a successful join. */
export function PasteInviteButton({ onJoined }: { onJoined: () => void | Promise<void> }) {
  const services = useServices();
  const showToast = useUiStore((s) => s.showToast);
  const [busy, setBusy] = useState(false);
  const run = async () => {
    const pasted = window.prompt(t('team.paste.prompt'));
    if (!pasted) return;
    setBusy(true);
    const outcome = await joinPastedInvite(services, pasted);
    setBusy(false);
    if (outcome === 'invalid') return showToast({ message: t('team.paste.invalid') });
    if (outcome === null) return showToast({ message: t('team.errors.generic') });
    if (!outcome.ok) return showToast({ message: outcome.message });
    showToast({ message: t('team.join.joined', { gym: outcome.gym }), duration: 4000 });
    await onJoined();
  };
  return (
    <Button variant="plain" icon="link" block disabled={busy} onClick={() => void run()} data-testid="paste-invite">
      {t('team.paste.button')}
    </Button>
  );
}
