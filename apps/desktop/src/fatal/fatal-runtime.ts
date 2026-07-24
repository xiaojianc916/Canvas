import { FatalIncidentController } from './fatal-controller'

export const fatalIncidentController =
  new FatalIncidentController()

let reactFatalHostMounted = false

export function markReactFatalHostMounted(): void {
  reactFatalHostMounted = true
}

export function isReactFatalHostMounted(): boolean {
  return reactFatalHostMounted
}
