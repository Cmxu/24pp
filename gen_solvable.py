"""Regenerate solvable.json with the Rust solver (github.com/Cmxu/24).

usage: python3 gen_solvable.py /path/to/solve24 [threads]
then:  node compress_solvable.js   (rewrites public/compressed_solvable.json)

A game is 7 cards plus a 3-digit goal dealt from one deck: four each of 1-9 and
sixteen 10s (10, J, Q, K). The goal's digits come out of the deck first, so a hand
may hold at most 4 - (times d appears in the goal) copies of card d.
"""
import itertools, json, subprocess, sys
from collections import Counter

goals = [v for v in range(100, 1000) if "0" not in str(v)]
hands = list(itertools.combinations_with_replacement(range(1, 11), 7))


def legal(hand_counts, goal_counts):
    return all(hand_counts[d] + goal_counts[d] <= 4 for d in range(1, 10))


# same order as the original generator: goal outer, hand inner
hand_counts = [Counter(h) for h in hands]
games = [(h, v) for v in goals for h, hc in zip(hands, hand_counts) if legal(hc, Counter(map(int, str(v))))]
stdin = "".join(" ".join(map(str, h)) + f" {v}\n" for h, v in games)
out = subprocess.run([sys.argv[1], "-j", sys.argv[2] if len(sys.argv) > 2 else "8"],
                     input=stdin, capture_output=True, text=True, check=True).stdout.splitlines()
assert len(out) == len(games), "solver printed a different number of lines than games"

solvable = {}
for (h, v), line in zip(games, out):
    if "No solution" not in line:
        solvable.setdefault(str(list(h)), []).append(v)
json.dump(solvable, open("solvable.json", "w"))
print(f"{len(games)} games, {sum(map(len, solvable.values()))} solvable, {len(solvable)} hands")
