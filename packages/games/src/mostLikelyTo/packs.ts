import type { PromptPack } from '../promptConfig.js';

/**
 * Themed packs a host can pour into their Most Likely To question list (Cycle 11). Pure
 * data — the web editor reads these; a host appends a pack, prunes it, and adds their own.
 */
export const PACKS: readonly PromptPack[] = [
  {
    id: 'party',
    name: 'Party',
    prompts: [
      'Who is most likely to survive a zombie apocalypse?',
      'Who is most likely to become internet famous?',
      'Who is most likely to move to another country on a whim?',
      'Who is most likely to talk their way out of a speeding ticket?',
      'Who is most likely to lose their phone at a festival?',
    ],
  },
  {
    id: 'office',
    name: 'Office',
    prompts: [
      'Who is most likely to reply-all to the whole company by mistake?',
      'Who is most likely to start a successful side hustle?',
      'Who is most likely to schedule a meeting that could be an email?',
      'Who is most likely to bring the best snacks to the office?',
      'Who is most likely to become the boss one day?',
    ],
  },
  {
    id: 'wholesome',
    name: 'Wholesome',
    prompts: [
      'Who is most likely to adopt a dozen rescue animals?',
      'Who is most likely to remember everyone’s birthday?',
      'Who is most likely to give a stranger their umbrella?',
      'Who is most likely to write a heartfelt thank-you note?',
    ],
  },
];
