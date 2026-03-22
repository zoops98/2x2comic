export interface PanelScript {
  panel: number;
  character: string;
  description: string;
  dialogue: string;
}

export interface Character {
  name: string;
  description: string;
  sheetImage?: string | null;
}

export interface FullScript {
  characters: Character[];
  panels: PanelScript[];
}

export type Step = 'STEP_1_TOPIC' | 'STEP_2_SCRIPT' | 'STEP_3_CHARACTERS' | 'STEP_4_COMIC';
export type StoryFormat = 'single' | 'serial';
export type ContinuationType = 'continue' | 'end';

export type TailDirection = 
  | 'top-left' | 'top-center' | 'top-right'
  | 'bottom-left' | 'bottom-center' | 'bottom-right'
  | 'left-top' | 'left-center' | 'left-bottom'
  | 'right-top' | 'right-center' | 'right-bottom';
