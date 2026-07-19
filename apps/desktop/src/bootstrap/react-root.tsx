import { createRoot } from 'react-dom/client'
import { MainWindow } from '../windows/main/MainWindow'
import { createApplicationRuntime } from './application'
import { ApplicationRuntimeProvider } from './react-providers'

const runtime = createApplicationRuntime()

export function mountReactApplication(container: HTMLElement): void {
  createRoot(container).render(
    <ApplicationRuntimeProvider runtime={runtime}>
      <MainWindow />
    </ApplicationRuntimeProvider>,
  )
}
