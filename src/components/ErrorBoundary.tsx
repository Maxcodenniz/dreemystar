import React, { Component, type ReactNode } from 'react';
import { isChunkLoadError } from '../utils/lazyWithRetry';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  /** When provided, boundary catches only errors in the named region (logged for diagnostics). */
  region?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * Catches render-time errors in any descendant tree and displays a
 * recovery UI instead of unmounting the entire application.
 *
 * Usage:
 *   <ErrorBoundary region="watch-page">
 *     <Watch />
 *   </ErrorBoundary>
 */
class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    const region = this.props.region ?? 'unknown';
    console.error(`[ErrorBoundary:${region}] Uncaught render error:`, error, info.componentStack);
  }

  private handleReset = () => {
    const err = this.state.error;
    if (err && isChunkLoadError(err)) {
      window.location.reload();
      return;
    }
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div className="min-h-[60vh] flex items-center justify-center bg-gray-950 px-6">
          <div className="max-w-md w-full text-center space-y-6">
            <div className="w-16 h-16 mx-auto rounded-2xl bg-red-500/20 border border-red-500/30 flex items-center justify-center">
              <svg className="w-8 h-8 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-white">Something went wrong</h2>
            <p className="text-gray-400 text-sm leading-relaxed">
              {this.state.error && isChunkLoadError(this.state.error)
                ? 'This usually happens after we publish an update: your browser still had an old copy. Reload the page to fetch the latest version.'
                : 'An unexpected error occurred. You can try reloading this section or go back to the home page.'}
            </p>
            {this.state.error && (
              <details className="text-left text-xs text-gray-500 bg-white/5 border border-white/10 rounded-xl p-4">
                <summary className="cursor-pointer font-semibold text-gray-400 mb-2">Error details</summary>
                <pre className="whitespace-pre-wrap break-words">{this.state.error.message}</pre>
              </details>
            )}
            <div className="flex gap-3 justify-center">
              <button
                onClick={this.handleReset}
                className="px-5 py-2.5 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white rounded-xl font-semibold transition-all duration-300 shadow-lg"
              >
                {this.state.error && isChunkLoadError(this.state.error) ? 'Reload page' : 'Try again'}
              </button>
              <button
                onClick={() => { window.location.href = '/'; }}
                className="px-5 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 rounded-xl font-semibold transition-all duration-300"
              >
                Go home
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
