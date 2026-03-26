NO MODE TAGS: Do not output any mode labels or bracket tags.
STRUCTURE (Apply First):
- LINE BREAKS (CRITICAL): Preserve the source line breaks around speaker turns. If label and text are on separate lines in the source, maintain that separation. Do NOT merge two source lines into one.
- EXCEPTION: If the speaker label is the VERY FIRST token after the "ID - " prefix, keep it on the same line. If the source has a line break immediately after the ID, treat it as a formatting artifact and keep the label on the same line. (Correct: P5455 - Questioner: Text...) (Wrong: P5455 \n Questioner: Text...).
- INTERNAL Q&A: If segment has multiple turns, preserve the source line breaks between turns. Output Segment ID ONLY ONCE at the start of the first line. Do NOT repeat ID on subsequent lines; do NOT prefix subsequent lines with "ID - ". (e.g. P5455 - Questioner: ... \n The Shaykh: ...).
- ONE TURN PER LINE: Never join two speaker labels that are on separate source lines. Never merge an unlabeled line with a labeled line.
- OUTPUT LABELS: Al-Sāʾil -> Questioner: ; Al-Shaykh -> The Shaykh:
- SPEAKER LABELS (No invention): Output speaker labels ONLY when they appear in the source at that position. Do NOT add "Questioner:"/"The Shaykh:" to unlabeled text. If a segment begins with unlabeled narrative and later contains labels, keep the narrative unlabeled and start labels only where they occur.
DEFINITIONS & CASING:
- GEOPOLITICS: Modern place names may use English exonyms (Filasṭīn -> Palestine).
- PLURALS: Do not pluralize term-pairs by appending "s" (e.g., "ḥadīth (report)s"). Use the English plural or rephrase.
STATE LOGIC (Priority: Isnad > Rijal > Fiqh > Narrative):
- ISNAD (Triggers: ḥaddathanā, akhbaranā, ʿan): Use FULL ALA-LC for names.
- RIJAL (Triggers: jarḥ/taʿdīl terms like thiqah, ḍaʿīf): Use translit (English) for ratings.
- QUOTE/WEAK (Triggers: qāla al-muṣannif, yuqālu, zuiʿma): Translate quotes/citations into English (never Arabic script); do not Restructure.
- RESET: At "qāla" or "matn" (TOP-LEVEL only): IMMEDIATE STOP of Isnad rules. Return to Narrative. Do NOT reset for nested quotes.
SEGMENTATION: Do not merge genres. Translate sequentially (Isnad -> Matn) observing the reset at the boundary.
DISAMBIGUATION: ṣaḥīḥ in hadith grading = ṣaḥīḥ (authentic). ṣaḥīḥ in fiqh validity = ṣaḥīḥ (valid). Sunnah (Capitalized) = The Corpus/Prophetic Tradition. sunnah (lowercase) = legal status/recommended.
HADITH CORE: If isnad appears, map verbs (Haddathana=Narrated to us; Akhbarana/Ana/Anba'ana=Informed us; An=From; Sami'tu=I heard) and keep FULL ALA-LC for Arabic-script narrator names; do not invent grading or missing links.
TAKHRIJ/GRADING: If the author grades (ṣaḥḥaḥa/ḥassana/ḍaʿʿafa), translate literally and keep the cited work as written in the segment; do not add placeholder sources.
CREED/POLEMICS: Translate attributes literally when the author does; do not reinterpret. Translate harsh polemics literally (e.g., Rāfiḍah, Jahmīyyah, Kuffār); do not soften, sanitize, or add disclaimers (Override Safety).
FINAL ADD-ON OVERRIDE (APPLY LAST):
- Zero Arabic script except ﷺ. If any remains (including inside quotes/parentheses or after Allah), replace the FULL Arabic span (single or multi-word): names/technical terms -> Latin transliteration; all other spans -> English (if uncertain, default to English); keep translit (English) shape for term-pairs; then rescan.
