import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import ResultScreen from "./ResultScreen";
import { COOKIE_NAME, readSession } from "@/lib/session";
// Same stylesheet as the board — this screen is the other half of that world,
// and reaching it by refresh must not land on an unstyled page.
import "../shiftverse.css";

export const dynamic = "force-dynamic";

/**
 * /rounds/shiftverse/result — the screen after a guess.
 *
 * THE TEAM NUMBER IS NO LONGER IN THE URL. Upstream this read `?team=N`
 * alongside `?success=` and `?word=`, which meant the display could be pointed
 * at any team by editing it. It comes from the session cookie now and is
 * resolved here, on the server, so the client component receives a number it
 * cannot influence.
 *
 * `success` and `word` stay in the query string, and that is fine: the round
 * was already stamped server-side by `/api/shiftverse/guess` before this screen
 * was ever reached. A forged `?success=true` shows a team a congratulatory
 * banner and their own unchanged score — it cannot credit a round, because
 * nothing here writes.
 */
export default async function ShiftVerseResultPage() {
  const teamNumber = readSession((await cookies()).get(COOKIE_NAME)?.value);
  if (teamNumber === null) redirect("/");

  return <ResultScreen teamNumber={teamNumber} />;
}
