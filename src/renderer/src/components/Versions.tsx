import { useState } from 'react'
import { useTranslation } from 'react-i18next'

function Versions(): React.JSX.Element {
  const { t } = useTranslation()
  const [versions] = useState(window.electron.process.versions)

  return (
    <ul className="versions">
      <li className="electron-version">
        {t('common.versions.electron', { version: versions.electron })}
      </li>
      <li className="chrome-version">
        {t('common.versions.chromium', { version: versions.chrome })}
      </li>
      <li className="node-version">{t('common.versions.node', { version: versions.node })}</li>
    </ul>
  )
}

export default Versions
