# Flap Bird

An HTML5 Canvas game inspired by Flappy Bird. No build step, no dependencies.

## Run locally

- With Python 3 installed:

```bash
python3 -m http.server 8000 --directory /workspace/flappy
```

Open `http://localhost:8000` in your browser.

## Controls

- Space / Click / Tap: Flap
- R: Restart after game over

## Notes

- Best score is saved in `localStorage` under the key `flap_best_score`.

