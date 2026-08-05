import type { PromptPack } from '../promptConfig.js';

/**
 * Themed packs a host can pour into their Guess Who question list (Cycle 11). Pure data —
 * the web editor reads these; a host appends a pack, prunes it, and adds their own. The tone
 * is warm, workplace-safe and a little funny (offsite / team energy, never edgy).
 */
export const PACKS: readonly PromptPack[] = [
  {
    id: 'around-the-office',
    name: 'Around the office',
    prompts: [
      'What is a small work win you are weirdly proud of?',
      'What is the best desk snack, no wrong answers?',
      'What would your job be in a parallel universe?',
      'What is a work habit you will defend to the end?',
      'What is the most useful thing a coworker ever taught you?',
    ],
  },
  {
    id: 'get-to-know-you',
    name: 'Get to know you',
    prompts: [
      'What is your go-to karaoke song?',
      'What hobby would you pick up with a free month?',
      'What is the best trip you have ever taken?',
      'What is your comfort movie or show?',
      'What is a small thing that instantly makes your day better?',
    ],
  },
  {
    id: 'deep-cuts',
    name: 'Deep cuts',
    prompts: [
      'What is a belief you have changed your mind about?',
      'What is something you are quietly proud of?',
      'What advice would you give your younger self?',
      'What is a moment that nudged your life in a new direction?',
    ],
  },
];
