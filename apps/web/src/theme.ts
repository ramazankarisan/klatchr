import { createTheme } from '@mui/material/styles';
import { tokens } from './tokens.js';

/** design.md tokens mapped onto an MUI theme. Paper-specific devices read tokens directly. */
export const theme = createTheme({
  palette: {
    background: { default: tokens.color.kraft, paper: tokens.color.card },
    text: { primary: tokens.color.ink, secondary: tokens.color.inkSoft },
    primary: { main: tokens.color.marker, dark: tokens.color.markerDeep, contrastText: '#ffffff' },
    success: { main: tokens.color.teal, contrastText: '#ffffff' },
    divider: tokens.color.kraft2,
  },
  typography: {
    fontFamily: tokens.font.body,
    h1: { fontFamily: tokens.font.display, fontWeight: 900, letterSpacing: '-0.03em' },
    h2: { fontFamily: tokens.font.display, fontWeight: 900, letterSpacing: '-0.02em' },
    h3: { fontFamily: tokens.font.display, fontWeight: 900, letterSpacing: '-0.02em' },
    button: { fontWeight: 800, textTransform: 'none' },
    overline: { fontWeight: 800, letterSpacing: '0.16em' },
  },
  shape: { borderRadius: tokens.radius.control },
});
