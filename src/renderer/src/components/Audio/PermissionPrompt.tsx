import { useTranslation } from 'react-i18next'

type PermissionPromptProps = {
  type: 'screen' | 'microphone'
  title: string
  message: string
  onRequest: (type: 'screen' | 'microphone') => void | Promise<void>
}

export function PermissionPrompt({
  type,
  title,
  message,
  onRequest
}: PermissionPromptProps): React.JSX.Element {
  const { t } = useTranslation()
  return (
    <div className="system-audio-permission">
      <strong>{title}</strong>
      <p className="muted">{message}</p>
      <button onClick={() => void onRequest(type)}>
        {type === 'screen' ? t('audio.openSettings') : t('audio.requestPermission')}
      </button>
    </div>
  )
}
