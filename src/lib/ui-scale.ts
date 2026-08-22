export const UI_SCALE_COOKIE = 'ui-scale'

export const UI_SCALES = [
  { value: 'sm', label: '작게', zoom: 0.9 },
  { value: 'md', label: '기본', zoom: 1 },
  { value: 'lg', label: '크게', zoom: 1.1 },
  { value: 'xl', label: '더 크게', zoom: 1.2 },
] as const

export type UiScale = (typeof UI_SCALES)[number]['value']

export function parseUiScale(v: string | undefined): UiScale {
  return (UI_SCALES.find((s) => s.value === v)?.value ?? 'md') as UiScale
}

export function uiScaleZoom(v: UiScale) {
  return UI_SCALES.find((s) => s.value === v)?.zoom ?? 1
}
