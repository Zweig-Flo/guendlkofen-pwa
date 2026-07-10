import { SegmentedControl } from '@mantine/core'
import { useTranslation } from 'react-i18next'

/** Toggles the active UI language between German and English. */
function LanguageSwitcher() {
  const { i18n } = useTranslation()
  const value = i18n.language.startsWith('en') ? 'en' : 'de'

  return (
    <SegmentedControl
      size="xs"
      value={value}
      onChange={(lng) => void i18n.changeLanguage(lng)}
      data={[
        { label: 'DE', value: 'de' },
        { label: 'EN', value: 'en' },
      ]}
    />
  )
}

export default LanguageSwitcher
