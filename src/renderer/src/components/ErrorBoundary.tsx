import { Component, type ErrorInfo, type ReactNode } from 'react'
import { withTranslation, type WithTranslation } from 'react-i18next'

type Props = WithTranslation & {
  children: ReactNode
  fallbackMessage?: string
  pageName?: string
}

type State = {
  hasError: boolean
  error: Error | null
}

class ErrorBoundaryInner extends Component<Props, State> {
  public constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  public componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[ErrorBoundary] Caught error:', error, info.componentStack)
    window.api.reportError({
      message: error.message,
      stack: error.stack,
      page: this.props.pageName
    })
  }

  public render(): ReactNode {
    if (this.state.hasError) {
      const { t, fallbackMessage } = this.props
      return (
        <div className="flex flex-col items-center justify-center gap-4 p-8 text-center">
          <div className="text-4xl">⚠️</div>
          <h2 className="text-lg font-semibold text-red-600">
            {t('errors.componentCrash', 'Something went wrong')}
          </h2>
          <p className="text-sm text-gray-500 max-w-md">
            {fallbackMessage ??
              this.state.error?.message ??
              t('errors.unknownError', 'An unexpected error occurred')}
          </p>
          <button
            type="button"
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
            onClick={() => this.setState({ hasError: false, error: null })}
          >
            {t('errors.retry', 'Try Again')}
          </button>
        </div>
      )
    }

    return this.props.children
  }
}

export const ErrorBoundary = withTranslation()(ErrorBoundaryInner)
