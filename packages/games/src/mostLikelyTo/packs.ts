import type { PromptPack } from '../promptConfig.js';

/**
 * Themed packs a host can pour into their Most Likely To question list (Cycle 11). Pure data —
 * the web editor reads these; a host appends a pack, prunes it, and adds their own. The tone is
 * warm, workplace-safe and a little funny — playful about people, never mean.
 */
export const PACKS: readonly PromptPack[] = [
  {
    id: 'party',
    name: 'Party',
    prompts: [
      'Who is most likely to plan the group trip down to the minute?',
      'Who is most likely to become quietly internet famous?',
      'Who is most likely to befriend everyone at the party?',
      'Who is most likely to have a fun fact for every situation?',
      'Who is most likely to start a wholesome group tradition?',
    ],
  },
  {
    id: 'office',
    name: 'Around the office',
    prompts: [
      'Who is most likely to bring the best snacks to share?',
      'Who is most likely to have the tidiest desk?',
      'Who is most likely to make a meeting genuinely fun?',
      'Who is most likely to quietly save the day before a deadline?',
      'Who is most likely to become the boss one day?',
    ],
  },
  {
    id: 'wholesome',
    name: 'Wholesome',
    prompts: [
      'Who is most likely to remember everyone’s birthday?',
      'Who is most likely to adopt a dozen rescue pets?',
      'Who is most likely to give a stranger their umbrella?',
      'Who is most likely to send a thank-you note that makes you tear up?',
    ],
  },
];
