import type { PromptPack } from '../promptConfig.js';

/**
 * Themed packs a host can pour into their Guess Who question list (Cycle 11). Pure data —
 * the web editor reads these; a host appends a pack, prunes it, and adds their own.
 */
export const PACKS: readonly PromptPack[] = [
  {
    id: 'work-safe',
    name: 'Work-safe',
    prompts: [
      'What is your most controversial food opinion?',
      'What would you do with an extra hour every day?',
      'What is a small thing that makes you unreasonably happy?',
      'What is the worst piece of advice you have ever received?',
      'What is a hill you are willing to die on?',
    ],
  },
  {
    id: 'get-to-know-you',
    name: 'Get to know you',
    prompts: [
      'What is the first concert you ever went to?',
      'What is a skill you wish you had picked up sooner?',
      'What is your go-to karaoke song?',
      'What is the best trip you have ever taken?',
      'What is a weirdly specific fear you have?',
    ],
  },
  {
    id: 'spicy',
    name: 'Spicy',
    prompts: [
      'What is a lie you told that you never got caught for?',
      'What is the pettiest reason you have ended a friendship?',
      'What is a trend you secretly think is overrated?',
      'What is something you pretend to like to fit in?',
    ],
  },
  {
    id: 'deep-cuts',
    name: 'Deep cuts',
    prompts: [
      'What is a belief you have changed your mind about?',
      'What is something you are quietly proud of?',
      'What is a piece of advice you would give your younger self?',
      'What is a moment that changed the direction of your life?',
    ],
  },
];
