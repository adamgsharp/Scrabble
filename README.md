# Scrabble Word Solver

A browser-based Scrabble helper that finds every word you can play, ranked by score.

## Quick start

```bash
python server.py
```

The server will:
1. Download the Scrabble word list on first run (~1 MB, TWL tournament dictionary)
2. Open `http://localhost:8080` in your browser automatically

> **No Python?** Open `index.html` directly in a browser — it will try to fetch
> the word list from GitHub automatically (requires internet access).

---

## How to use

### 1 · Add your tiles
Click any **+** slot in the rack to pick a letter.
Choose **Blank tile** for a wild tile that can represent any letter (scores 0).

### 2 · (Optional) Lock tile positions
Click a filled tile to open the position panel.
- **Position from start** — e.g. "2nd" means this letter must be the 2nd letter of the word.
- **Position from end** — e.g. "Last" means this letter must be the final letter.

Multiple constraints are combined: all must be satisfied simultaneously.

### 3 · (Optional) Add board tiles
Enter letters already on the board that you want to play *through*.
The solver only shows words that contain those letters as a consecutive sequence.

### 4 · Find Words
Click **Find Words**. Results are shown as Scrabble tiles, sorted by score.

A **BINGO** badge appears when you use all 7 hand tiles (normally worth a +50 bonus).
Green tiles in results = letters from the board.

---

## Scoring

Standard Scrabble face values are used (no premium squares):

| 1 pt | A E I O U L N S T R |
|------|----------------------|
| 2 pt | D G |
| 3 pt | B C M P |
| 4 pt | F H V W Y |
| 5 pt | K |
| 8 pt | J X |
| 10 pt | Q Z |
| 0 pt | Blank |

---

## Word list

Uses the **TWL06** (Tournament Word List) — the standard for North American Scrabble competition, containing ~178,000 valid words.
