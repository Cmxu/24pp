import json
import numpy as np
from itertools import combinations
import time
from matplotlib import pyplot as plt
from tqdm import tqdm
import itertools
import sys

val = sys.argv[1]

ops = ['+', '-', '*', '/']
inverse_ops = {'+':'-', '-':'+', '*':'/', '/':'x'}

def make_deck():
    return [1,2,3,4,5,6,7,8,9,10,10,10,10]*4
def create_game(num_cards = 7, digits = 3):
    deck = make_deck()
    np.random.shuffle(deck)
    hand = deck[:num_cards]
    val = list(filter((10).__ne__, deck[num_cards:]))[:digits]
    return hand, sum([val[i] * (10**i) for i in range(digits)])
def bspp(h, v, a = True):
    f, s = brute_speed(h, v)
    if f:
        if a:
            print(brute_pretty_print(s, h))
        else:
            print('Solution Found')
    else:
        print('No Solution Found')
def pretty_print(sol):
    pretty = str(sol[0][0]) if sol[0][1] == '-' else str(-sol[0][0])
    for i, (card, op) in enumerate(sol[1:]):
        if i == 0:
            pretty = pretty + ' ' + inverse_ops[op] + ' ' + str(card)
        else:    
            pretty = '(' + pretty + ') ' + inverse_ops[op] + ' ' + str(card)
    return pretty


def par_sur(p1):
    if p1[0] == '(' and p1[-1] ==  ')':
        count = 0
        change = False
        for c in p1[:-1]:
            if c == '(':
                change = True
                count += 1
            elif c == ')':
                change = True
                count -= 1
            if change:
                if count == 0:
                    return False
        if change:
            return True
        else:
            return False
    else:
        return False
    
def opstr(p1, p2, op, par_red):
    if par_red:
        if op == '*':
            return p1 + ' ' + op + ' ' + p2
        elif op == '+':
            p1 = p1[1:-1] if par_sur(p1) else p1
            p2 = p2[1:-1] if par_sur(p2) else p2
            return '(' + p1 + ' ' + op + ' ' + p2 + ')'
        else:
            return '(' + p1 + ' ' + op + ' ' + p2 + ')'
    else:
        return '(' + p1 + ' ' + op + ' ' + p2 + ')'

def evalop(c1, c2, op):
    if op == '+':
        r = c1 + c2
    elif op == '-':
        r = c1 - c2
    elif op == '*':
        r = c1 * c2
    else:
        r = c1 / c2
    return r
    
def brute_pretty_print(sol, hand, par_red = True):
    if not sol:
        return 'No Solution Found'
    stor = {}
    for card in hand:
        if stor.get(card, False):
            stor[card].append(str(card))
        else:
            stor[card] = [str(card)]
    while sol:
        c1, c2, op = sol.pop()
        if c1 == c2:
            if stor.get(c1, False):
                if len(stor[c1]) > 1:
                    p1 = stor[c1][0]
                    stor[c1] = stor[c1][1:]
                    p2 = stor[c2][0]
                    if len(stor[c2]) > 1:
                        stor[c2] = stor[c2][1:]
                    else:
                        stor.pop(c2)
                    r = evalop(c1, c2, op)
                    if stor.get(r, False):
                        stor[r].append(opstr(p1, p2, op, par_red))
                    else:
                        stor[r] = [opstr(p1, p2, op, par_red)]
                else:
                   sol.insert(1, [c1, c2, op]) 
            else:
                sol.insert(1, [c1, c2, op])
        else:
            if stor.get(c1, False) and stor.get(c2, False):
                p1 = stor[c1][0]
                if len(stor[c1]) > 1:
                    stor[c1] = stor[c1][1:]
                else:
                    stor.pop(c1)
                p2 = stor[c2][0]
                if len(stor[c2]) > 1:
                    stor[c2] = stor[c2][1:]
                else:
                    stor.pop(c2)
                r = evalop(c1, c2, op)
                if stor.get(r, False):
                    stor[r].append(opstr(p1, p2, op, par_red))
                else:
                    stor[r] = [opstr(p1, p2, op, par_red)]
            else:
                sol.insert(1, [c1, c2, op])
    res = stor[list(stor.keys())[0]][0]
    return res[1:-1] if par_sur(res) else res

sv = {}
def brute_speed(hand, val, ops = ['+', '-', '*', '/', '-2', '/2']):
    global sv
    if len(hand) == 1:
        if val == hand[0]:
            return True, []
        else:
            return False, []
    hand.sort()
    key = str(hand)
    #key = [0 if i == 10 else i for i in hand]
    #key = sum([key[i]*(10**i) for i in range(len(key))])
    if sv.get(key, False):
        return False, []
    hand_c = hand.copy()
    combos = set(combinations(hand_c, 2))
    for card2, card1 in combos:
        hand.remove(card1)
        hand.remove(card2)
        for op in ops:
            if op == '*':
                hand.append(card1 * card2)
                w, l = brute_speed(hand, val, ops = ops)
                hand.remove(card1 * card2)
            elif op == '+':
                hand.append(card1 + card2)
                w, l = brute_speed(hand, val, ops = ops)
                hand.remove(card1 + card2)
            elif op == '-':
                hand.append(card1 - card2)
                w, l = brute_speed(hand, val, ops = ops)
                hand.remove(card1 - card2)
            elif op == '-2':
                hand.append(card2 - card1)
                w, l = brute_speed(hand, val, ops = ops)
                hand.remove(card2 - card1)
            elif (not card2 == 0) & (op == '/'):
                hand.append(card1 / card2)
                w, l = brute_speed(hand, val, ops = ops)
                hand.remove(card1 / card2)
            elif (not card1 == 0) & (op == '/2'):
                hand.append(card2 / card1)
                w, l = brute_speed(hand, val, ops = ops)
                hand.remove(card2 / card1)
            else:
                continue
            if w:
                hand.append(card1)
                hand.append(card2)
                if op == '-2':
                    l.append([card2, card1, '-'])
                elif op == '/2':
                    l.append([card2, card1, '/'])
                else:
                    l.append([card1, card2, op])
                return True, l
        hand.append(card1)
        hand.append(card2)
    sv[key] = True
    return False, []

solvable_hands = []
arr = [4,4,4,4,4,4,4,4,4,100]
for i in str(val):
    arr[int(i)] -= 1

possible_vals = [i for i in range(100, 1000)]
possible_vals = [i for i in possible_vals if '0' not in str(i)]
solvable_hands = {}
counts = []
tots = []
times_succ = []
times_fail = []
for val in tqdm(possible_vals):
    arr = [4,4,4,4,4,4,4,4,4,100]
    for i in str(val):
        arr[int(i)] -= 1
    sv = {}
    count = 0
    tot = 0
    times = [0,0]
    for i in range(1,11):
        for j in range(i, 11):
            for k in range(j, 11):
                for l in range(k, 11):
                    for m in range(l, 11):
                        for n in range(m, 11):
                            for o in range(n, 11):
                                if sum([(sum([y == x for y in [i,j,k,l,m,n,o]]) - arr[x-1])>0 for x in range(1,11)]) == 0:
                                    tot += 1
                                    start = time.time()
                                    status, sol = brute_speed([float(ab) for ab in [i,j,k,l,m,n,o]], val)
                                    end = time.time()
                                    if status:
                                        solvable_hands[str([i,j,k,l,m,n,o])] = solvable_hands.get(str([i,j,k,l,m,n,o]), []) + [val]
                                        count += 1
                                        times[0] += (end - start)
                                    else:
                                        times[1] += (end - start)
    counts.append(count)
    tots.append(tot)
    times_succ.append(times[0])
    times_fail.append(times[1])
    print('Completed ' + str(val) + ': ' + str(count/tot) + ', ' + str(times[0] + times[1]))
with open(f'solvable.json', 'w') as f:
    json.dump(solvable_hands, f)

# start = time.time()
# sv = {}
# print(f'Starting to solve for {val}')
# pbar = tqdm(total=8000)
# for i in range(1,11):
#     for j in range(i, 11):
#         for k in range(j, 11):
#             for l in range(k, 11):
#                 for m in range(l, 11):
#                     for n in range(m, 11):
#                         for o in range(n, 11):
#                             if sum([(sum([y == x for y in [i,j,k,l,m,n,o]]) - arr[x-1])>0 for x in range(1,11)]) == 0:
#                                 status, sol = brute_speed([float(ab) for ab in [i,j,k,l,m,n,o]], val)
#                                 #print(len(sv))
#                                 pbar.update(1)
#                                 if status:
#                                     solvable_hands.append([i,j,k,l,m,n,o])
# with open(f'solvable/{val}.json', 'w') as f:
#     json.dump(solvable_hands, f)
# print(f'Completed in {time.time() - start} seconds')