export type DatasetId = string & { readonly __brand: 'DatasetId' }

export type ColumnType = 'number' | 'string' | 'date' | 'boolean'

export interface DatasetColumn {
  readonly name: string
  readonly type: ColumnType
}

export interface Dataset {
  readonly id: DatasetId
  readonly name: string
  readonly columns: readonly DatasetColumn[]
  readonly rows: readonly (number | string | boolean | null)[][]
}

export interface ChartSeries {
  readonly datasetId: DatasetId
  readonly xColumn: string
  readonly yColumn: string
  readonly color: string
}

export interface ChartSpec {
  readonly title: string
  readonly series: readonly ChartSeries[]
}
