export interface LocalizedText {
  de: string;
  en: string;
}

export type OpeningCategory = 'open' | 'semi_open' | 'closed' | 'indian' | 'flank';

export type StrategyCategory = 'tactics' | 'strategy' | 'endgame';

export type DifficultyLevel = 'beginner' | 'intermediate' | 'advanced';

export interface OpeningEntry {
  id: string;
  eco: string;
  category: OpeningCategory;
  difficulty: DifficultyLevel;
  name: LocalizedText;
  movesSan: string[];
  summary: LocalizedText;
  keyIdeasWhite: LocalizedText[];
  keyIdeasBlack: LocalizedText[];
  watchOut: LocalizedText;
  recommendedSide: 'w' | 'b';
}

export interface LexiconArrow {
  from: string;
  to: string;
  kind: 'best' | 'alt' | 'danger';
}

export interface StrategyEntry {
  id: string;
  category: StrategyCategory;
  difficulty: DifficultyLevel;
  name: LocalizedText;
  summary: LocalizedText;
  keyPrinciples: LocalizedText[];
  exampleFen: string;
  exampleMovesSan: string[];
  exampleExplanation: LocalizedText;
  orientSide: 'w' | 'b';
  highlightArrows?: LexiconArrow[];
}

export interface DetectedOpening {
  eco: string;
  name: LocalizedText;
  openingId?: string;
  matchedPlies: number;
}
