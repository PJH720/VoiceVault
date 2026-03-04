import { useEffect, useMemo, useState } from 'react'
import { useTranslation as useI18n } from 'react-i18next'
import type { TranscriptSegment, TranslationResult } from '../../../../shared/types'
import { useTranslation } from '../../hooks/useTranslation'
import { LanguageSelector } from './LanguageSelector'
import { QualityIndicator } from './QualityIndicator'

type BilingualTranscriptProps = {
  segments: TranscriptSegment[]
}

export function BilingualTranscript({ segments }: BilingualTranscriptProps): React.JSX.Element | null {
  const { t } = useI18n()
  const {
    enabled,
    targetLanguage,
    languages,
    isTranslating,
    progress,
    toggleEnabled,
    changeTargetLanguage,
    translateBatch
  } = useTranslation()
  const [translations, setTranslations] = useState<Map<number, TranslationResult>>(new Map())

  const translatableSegments = useMemo(
    () =>
      segments
        .map((segment, index) => ({
          id: segment.id ?? -(index + 1),
          text: segment.text,
          language: segment.language
        }))
        .filter((item) => item.text.trim().length > 0),
    [segments]
  )

  useEffect(() => {
    if (!enabled) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTranslations(new Map())
    if (translatableSegments.length === 0) return
    const sourceLanguage = translatableSegments[0]?.language ?? 'en'
    void translateBatch(
      translatableSegments.map((item) => ({ id: item.id, text: item.text })),
      sourceLanguage
    ).then((rows) => {
      const next = new Map<number, TranslationResult>()
      for (const row of rows) {
        next.set(row.id, row.result)
      }
      setTranslations(next)
    })
  }, [enabled, targetLanguage, translatableSegments, translateBatch])

  if (segments.length === 0) return null

  return (
    <div className="panel translation-panel">
      <div className="translation-head">
        <h3>{t('translation.title')}</h3>
        <button onClick={toggleEnabled}>{enabled ? t('translation.off') : t('translation.on')}</button>
      </div>
      {enabled ? <LanguageSelector targetLanguage={targetLanguage} languages={languages} onChange={changeTargetLanguage} /> : null}
      {enabled && isTranslating ? (
        <p className="muted">
          {t('translation.progress', { current: progress.current, total: progress.total })}
        </p>
      ) : null}
      {enabled ? (
        <div className="translation-grid">
          {translatableSegments.map((segment) => {
            const translated = translations.get(segment.id)
            return (
              <div key={segment.id} className="translation-row">
                <div>
                  <div className="lang-badge">
                    {t('translation.original', { lang: segment.language.toUpperCase() })}
                  </div>
                  <p className="segment-text">{segment.text}</p>
                </div>
                <div>
                  <div className="translation-meta">
                    <span className="lang-badge">
                      {t('translation.translated', { lang: targetLanguage.toUpperCase() })}
                    </span>
                    {translated ? <QualityIndicator confidence={translated.confidence} /> : null}
                  </div>
                  <p className="segment-text muted">
                    {translated?.translatedText ?? (isTranslating ? t('translation.translatingInline') : '-')}
                  </p>
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <p className="muted">{t('translation.empty')}</p>
      )}
    </div>
  )
}
