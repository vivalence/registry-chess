// the move sound: a chess piece set down on a wooden board — freesound.org/s/546119/ "Piece
// Placement" by el_boss, CC0 — cut to 0.12 s of mono mp3, peak at -1 dB, and carried inline,
// since the bundler ships nothing but JS. the preference lives in the browser: the rail flips
// it, the board asks it before every play. decoded once into an AudioContext, so a move sounds
// without the decoder's lead-in.
const CLIP = "data:audio/mpeg;base64,SUQzBAAAAAAAIlRTU0UAAAAOAAADTGF2ZjYzLjEuMTAxAAAAAAAAAAAAAAD/83DAAAAAAAAAAAAASW5mbwAAAA8AAAAHAAAE/wBDQ0NDQ0NDQ0NDQ0NDQ2NjY2NjY2NjY2NjY2NjgoKCgoKCgoKCgoKCgoKhoaGhoaGhoaGhoaGhoaHBwcHBwcHBwcHBwcHBweDg4ODg4ODg4ODg4ODg//////////////////8AAAAATGF2YzYzLjEuAAAAAAAAIDMAAAAAJAPfAAAAAAAABP9dw4lRAAAAAAAAAAAAAAAAAP/zYMQAFlDmZK9BGAAcoCfABYxvGMeUwAAAAAIYAAJuHA3jvoW7vxERNEAwNw+ULggNPoKOygficHy7wQdLg/BCsH/1Ag4TvB+CAYKO4IfreH8mXPqBCCH5SCHL4PvB/8vygYKOB9XsapSGXpoEFgQYAEqTdTrsgYK9rYqA202XHbUS+OX5B1nSJQzMiaMUnl4YpAL7groixxD1Mv/zYsQ1LVt+5vePaAEepfTj0IJaPcepJqMi+XEC+XzcYUmkiPYeho50e5dMR7m6i4yx4mA3nCTZZqwwSRQSPugXzdBjM3QMjcco9igieUcNkjV0Jgqg3oIG790TiZoXj7MbLSd0VWujt0EP7/NfZS/RfNmfU9Kvvpug1BBn/+meNt00Fl6P/y53zTYw0aqySOQAlS3VpZE05ddghKz/82LEDyL7rtovzDACIyRosVHltC449lukaVnaJkyJtJJRFnNVOKMOnEbrAVzRC7SaHN9JKPbb2Zd5+G7tm/Wp0szm53z1S6d2/am/eZdtu32ff8vmXNf/f885r/Xz/98/bv2bv6rHl/+2yhGt31ikLeI3Jmlh0V1n8b/PpoqMqvk7Va276RbFHzNRkkFS/6RBo8imhlMgSSRPHkNY//NixBMko7K15kmLxtSahFUSgqZQkDZGUJ0YLWkFZx5K6KKFk75rEREPMIiYRirqnSSO4f6LcQlGVEWxqJVCSqdmfOdoHonCJ+tJg1clt13x6n/onLNVt13bCMtTtkz3zq12YiSsZSlb+m8zX/l9LWcpatFg8Y4IeiLUpb0Kxkd+a60MU4sh0SiEJfklPVgC5P+W0rkvyRBSMqGhJP/zYMQQItMqpWdGWALKs6ZzTog64nHmjqXG4vcVG0mB43Kz6yRsO49IINDtJI2tIoamycUePHSaOl9saUnSSdk1a6kc1bUHT0Q5BU2ai550lW537a6dcIpIoumj1dOddNqf5/cqsi2m922v////1am7i/5/+47vmp+vmmqigoVGaiolMuFm64lVAUAsfr8C6r4HGDg68PVEIxXDI//zYsQTIdJiaMGIiAAyK8NaJABokyREcrkQDUA0MMbMTR9Hy6A9AVArwAfUXjg5wzvwN4DYCyI0FLBhAMSkyVVUSkZfxjhZwfCJuJoiwskXY4nVRVSOmP/JgPaIoLiJwkCJEyYEmTJPG7GSpkk9VFaP/8nEwgUFQwoFgpV//qIoelVMQU1FNC4wVVVVVVVVVVVVVVVVVVVVVVVVVVX/82LEGwAAA0gBwAAAVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV";

export const KEY = "chess.sound";

export const wanted = () => {
  try {
    return localStorage.getItem(KEY) !== "off";
  } catch {
    return true;
  }
};

export const remember = (on) => {
  try {
    localStorage.setItem(KEY, on ? "on" : "off");
  } catch {
    // a browser without storage forgets between visits, nothing more
  }
};

let context = null;
let decoding = null;

const load = () => {
  context ??= new AudioContext();
  decoding ??= fetch(CLIP)
    .then((response) => response.arrayBuffer())
    .then((bytes) => context.decodeAudioData(bytes));
  return decoding;
};

// a move sounds when the preference says so. a page that has had no gesture yet cannot resume
// its context, and stays quiet — the first click on it is a gesture, and every move is one
export const play = async () => {
  if (!wanted() || typeof AudioContext === "undefined") return false;
  try {
    const clip = await load();
    if (context.state === "suspended") await context.resume();
    const source = context.createBufferSource();
    source.buffer = clip;
    source.connect(context.destination);
    source.start();
    return true;
  } catch {
    return false;
  }
};
