/**
 * Types for related assets functionality
 */

export interface RelatedAsset {
  id: string;
  name: string;
  type: 'dashboard' | 'analysis' | 'dataset' | 'datasource';
  relationship?: string;
}

export interface AssetWithRelations {
  id: string;
  name: string;
  type: string;
  relatedAssets?: RelatedAsset[];
}