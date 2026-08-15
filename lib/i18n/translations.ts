import type { GamePhase, Role, Side } from '@/lib/game/types'

export type Language = 'en' | 'cs'

export interface Translations {
  languageSwitcher: {
    label: string
    english: string
    czech: string
  }
  app: {
    title: string
    subtitle: string
    preparingBattlefield: string
    newGame: string
    gameOver: string
    playerWinsCampaign: string
    npcWinsCampaign: string
    playerArmyName: string
    opponentName: string
    roundLabel: (attackerSide: Side) => string
    phaseLabel: (phase: GamePhase, hasRoundResult: boolean) => string
    status: {
      roundResult: string
      gameOver: (winner: Side | null) => string
      selectingHumanDefender: (requiredCount: number) => string
      selectingSkipRound: string
      selectingNpcDefender: string
      combatChooseDefender: string
      combatRevealNext: string
      combatResolving: string
      combatNpcReply: string
      combatNpcAutoReveal: string
      combatReviewFinalDuel: string
    }
  }
  roles: Record<Role, string>
  armies: {
    opponentCommand: string
    playerCommand: string
    available: string
    resting: string
    restArea: (armyName: string) => string
  }
  board: {
    playerRole: string
    fieldOrders: string
    commandOverview: string
    gameOverOverview: string
    defenderOverview: string
    npcOverview: string
    roundResult: string
    reviewBattle: string
    roundSettled: string
    youCaptured: string
    youLost: string
    noCapturedCards: string
    noLostCards: string
    campaignEndingNotice: string
    roundRedoPrompt: string
    roundRedoDescription: string
    redoRound: string
    continue: string
  }
  battleSlots: {
    battlefield: string
    activeDuelLine: string
    reviewRoundResult: string
    chooseDefender: string
    revealHiddenAttacker: string
    preparingRoundResult: string
    assemblingLines: string
    waitingForReveal: string
    npcDefendingAutomatically: string
    attackerQueue: string
    remaining: (count: number) => string
    hiddenColumn: string
    revealedAttacker: string
    noRevealedAttacker: string
    revealNextAttacker: string
    defenderPool: string
    tapCardToDeploy: string
    cardsInReserve: string
    noDefenderCards: string
    resolvedDuels: string
    waitingForFirstClash: string
    defenderHeldLine: string
    attackerBrokeThrough: string
  }
  selector: {
    title: string
    heading: string
    selected: (selected: number, required: number) => string
    instruction: (requiredCount: number) => string
    committedNotice: string
    confirmDefenders: string
  }
  restArea: {
    restingCount: (count: number) => string
    empty: string
    roundsRemaining: (rounds: number) => string
  }
  cards: {
    power: string
    backLabelTop: string
    backLabelBottom: string
    faceDownAriaLabel: string
    cardAriaLabel: (rank: string, suit: string, power: number) => string
  }
}

const en: Translations = {
  languageSwitcher: {
    label: 'Language',
    english: 'English',
    czech: 'Čeština',
  },
  app: {
    title: 'Battle Card Game',
    subtitle: 'Napoleonic field command table',
    preparingBattlefield: 'Preparing the battlefield...',
    newGame: 'New Game',
    gameOver: 'Game over',
    playerWinsCampaign: 'You win the campaign!',
    npcWinsCampaign: 'Marshal Automaton wins the campaign!',
    playerArmyName: 'Your Army',
    opponentName: 'Marshal Automaton',
    roundLabel: (attackerSide) => (attackerSide === 'player' ? 'Player attack' : 'NPC attack'),
    phaseLabel: (phase, hasRoundResult) => {
      if (hasRoundResult) {
        return 'Round result'
      }

      if (phase === 'selecting') {
        return 'Selection phase'
      }

      if (phase === 'combat') {
        return 'Combat in progress'
      }

      if (phase === 'game-over') {
        return 'Campaign complete'
      }

      return 'Battle update'
    },
    status: {
      roundResult:
        'The duel line is settled. Review captured and lost cards before continuing to the next battlefield update.',
      gameOver: (winner) =>
        `${winner === 'player' ? 'Your army' : 'Marshal Automaton'} controls the field.`,
      selectingHumanDefender: (requiredCount) =>
        `Select ${requiredCount} defender card${requiredCount === 1 ? '' : 's'} from your hand while the NPC prepares a hidden attack.`,
      selectingSkipRound:
        'No soldiers are ready on one side, so the round will be skipped while resting units recover.',
      selectingNpcDefender:
        'Your army attacks this round. The NPC is automatically choosing its defending line.',
      combatChooseDefender:
        'A hostile regiment is revealed. Choose which defender from your committed pool will answer it.',
      combatRevealNext: 'Reveal the next hidden attacker when you are ready.',
      combatResolving: 'All cards are resolved. The round result will appear shortly.',
      combatNpcReply: 'The NPC is choosing its reply to your revealed attack.',
      combatNpcAutoReveal:
        'Your attacking queue is ready. The next attacker will be revealed automatically.',
      combatReviewFinalDuel:
        'The round is resolved. Review the final duel before the round result appears.',
    },
  },
  roles: {
    attacker: 'attacker',
    defender: 'defender',
  },
  armies: {
    opponentCommand: 'Opponent command',
    playerCommand: 'Player command',
    available: 'Available',
    resting: 'Resting',
    restArea: (armyName) => `${armyName} rest area`,
  },
  board: {
    playerRole: 'Player role',
    fieldOrders: 'Field orders',
    commandOverview: 'Command overview',
    gameOverOverview: 'The campaign is over. Start a new game to redeploy both armies.',
    defenderOverview:
      'Your current defender pool is shown on the battlefield. Reveal attackers and answer them one by one.',
    npcOverview:
      'The NPC will complete its round automatically while you watch the duel line resolve.',
    roundResult: 'Round result',
    reviewBattle: 'Review the battle before moving on',
    roundSettled:
      'The round is settled. Continue when you are ready to begin the next battlefield update.',
    youCaptured: 'You captured',
    youLost: 'You lost',
    noCapturedCards: 'No enemy cards were captured.',
    noLostCards: 'No cards were lost this round.',
    campaignEndingNotice: 'This battle ends the campaign. Continue to see the final result.',
    roundRedoPrompt: 'One-time easy command',
    roundRedoDescription:
      'This round cost you soldiers. You may replay the entire round once before marching on.',
    redoRound: 'Redo this round',
    continue: 'Continue',
  },
  battleSlots: {
    battlefield: 'Battlefield',
    activeDuelLine: 'Active duel line',
    reviewRoundResult: 'Review the round result before issuing fresh orders.',
    chooseDefender: 'Choose a defender card to answer the revealed attacker.',
    revealHiddenAttacker: 'Reveal the next hidden attacker to continue the battle.',
    preparingRoundResult: 'All clashes are settled. The round result is being prepared.',
    assemblingLines: 'The armies are assembling their lines for the next clash.',
    waitingForReveal: 'Waiting for the next attacker reveal.',
    npcDefendingAutomatically: 'NPC is defending automatically.',
    attackerQueue: 'Attacker queue',
    remaining: (count) => `${count} remaining`,
    hiddenColumn: 'Hidden column',
    revealedAttacker: 'Revealed attacker',
    noRevealedAttacker: 'No attacker is revealed right now.',
    revealNextAttacker: 'Reveal next attacker',
    defenderPool: 'Defender pool',
    tapCardToDeploy: 'Tap a card to deploy',
    cardsInReserve: 'Cards in reserve',
    noDefenderCards: 'No defender cards remain in the pool.',
    resolvedDuels: 'Resolved duels',
    waitingForFirstClash: 'The field is still waiting for its first clash.',
    defenderHeldLine: 'Defender held the line',
    attackerBrokeThrough: 'Attacker broke through',
  },
  selector: {
    title: 'Defender selection',
    heading: 'Commit your line of battle',
    selected: (selected, required) => `${selected} / ${required} selected`,
    instruction: (requiredCount) =>
      `Select exactly ${requiredCount} cards from your available army to defend this round.`,
    committedNotice: 'Once committed, these cards become your face-up defender pool for the round.',
    confirmDefenders: 'Confirm defenders',
  },
  restArea: {
    restingCount: (count) => `${count} resting`,
    empty: 'No cards are resting in this regiment.',
    roundsRemaining: (rounds) => `${rounds} round${rounds === 1 ? '' : 's'}`,
  },
  cards: {
    power: 'Power',
    backLabelTop: 'Imperial',
    backLabelBottom: 'Guard',
    faceDownAriaLabel: 'Face-down playing card',
    cardAriaLabel: (rank, suit, power) => `${rank} of ${suit}, power ${power}`,
  },
}

const cs: Translations = {
  languageSwitcher: {
    label: 'Jazyk',
    english: 'English',
    czech: 'Čeština',
  },
  app: {
    title: 'Kartová bitevní hra',
    subtitle: 'Napoleonské polní velitelské stanoviště',
    preparingBattlefield: 'Připravuji bojiště...',
    newGame: 'Nová hra',
    gameOver: 'Konec hry',
    playerWinsCampaign: 'Vyhrál jsi tažení!',
    npcWinsCampaign: 'Maršál Automatón vyhrává tažení!',
    playerArmyName: 'Tvoje armáda',
    opponentName: 'Maršál Automatón',
    roundLabel: (attackerSide) => (attackerSide === 'player' ? 'Útok hráče' : 'Útok NPC'),
    phaseLabel: (phase, hasRoundResult) => {
      if (hasRoundResult) {
        return 'Výsledek kola'
      }

      if (phase === 'selecting') {
        return 'Fáze výběru'
      }

      if (phase === 'combat') {
        return 'Souboj probíhá'
      }

      if (phase === 'game-over') {
        return 'Tažení dokončeno'
      }

      return 'Stav bitvy'
    },
    status: {
      roundResult:
        'Linie soubojů je uzavřena. Prohlédni si získané a ztracené karty, než přejdeš na další stav bojiště.',
      gameOver: (winner) =>
        `${winner === 'player' ? 'Tvoje armáda' : 'Maršál Automatón'} ovládá bojiště.`,
      selectingHumanDefender: (requiredCount) =>
        `Vyber ${requiredCount} obrann${requiredCount === 1 ? 'ou kartu' : requiredCount >= 2 && requiredCount <= 4 ? 'é karty' : 'ých karet'} z ruky, zatímco NPC připravuje skrytý útok.`,
      selectingSkipRound:
        'Na jedné straně nejsou připravení vojáci, takže se kolo přeskočí, než se zotaví odpočívající jednotky.',
      selectingNpcDefender:
        'Tvoje armáda v tomto kole útočí. NPC automaticky vybírá svou obrannou linii.',
      combatChooseDefender:
        'Nepřátelský pluk byl odhalen. Vyber, který obránce z připravené skupiny mu odpoví.',
      combatRevealNext: 'Až budeš připravený, odhal dalšího skrytého útočníka.',
      combatResolving: 'Všechny karty jsou vyhodnocené. Za chvíli se zobrazí výsledek kola.',
      combatNpcReply: 'NPC vybírá odpověď na tvůj odhalený útok.',
      combatNpcAutoReveal: 'Tvoje útočná fronta je připravená. Další útočník se odhalí automaticky.',
      combatReviewFinalDuel:
        'Kolo je vyhodnocené. Prohlédni si poslední souboj, než se zobrazí výsledek kola.',
    },
  },
  roles: {
    attacker: 'útočník',
    defender: 'obránce',
  },
  armies: {
    opponentCommand: 'Velení soupeře',
    playerCommand: 'Velení hráče',
    available: 'Připravené',
    resting: 'Odpočívají',
    restArea: (armyName) => `Zázemí: ${armyName}`,
  },
  board: {
    playerRole: 'Role hráče',
    fieldOrders: 'Polní rozkazy',
    commandOverview: 'Přehled velení',
    gameOverOverview: 'Tažení skončilo. Spusť novou hru a znovu rozmísti obě armády.',
    defenderOverview:
      'Tvoje aktuální obranná skupina je zobrazená na bojišti. Odhaluj útočníky a odpovídej jim jednoho po druhém.',
    npcOverview: 'NPC dokončí své kolo automaticky, zatímco sleduješ vyhodnocení linie soubojů.',
    roundResult: 'Výsledek kola',
    reviewBattle: 'Prohlédni si bitvu, než budeš pokračovat',
    roundSettled: 'Kolo je uzavřené. Pokračuj, až budeš připravený zahájit další stav bojiště.',
    youCaptured: 'Získal jsi',
    youLost: 'Přišel jsi o',
    noCapturedCards: 'Nezískal jsi žádné nepřátelské karty.',
    noLostCards: 'V tomto kole jsi nepřišel o žádné karty.',
    campaignEndingNotice: 'Tato bitva ukončuje celé tažení. Pokračuj a zobrazí se konečný výsledek.',
    roundRedoPrompt: 'Jednorázový lehký rozkaz',
    roundRedoDescription:
      'Toto kolo tě stálo vojáky. Než potáhneš dál, můžeš jednou zopakovat celé kolo.',
    redoRound: 'Zopakovat celé kolo',
    continue: 'Pokračovat',
  },
  battleSlots: {
    battlefield: 'Bojiště',
    activeDuelLine: 'Aktivní linie soubojů',
    reviewRoundResult: 'Než vydáš nové rozkazy, prohlédni si výsledek kola.',
    chooseDefender: 'Vyber obránce, který odpoví na odhaleného útočníka.',
    revealHiddenAttacker: 'Odhal dalšího skrytého útočníka a pokračuj v bitvě.',
    preparingRoundResult: 'Všechny střety jsou vyhodnocené. Připravuji výsledek kola.',
    assemblingLines: 'Armády sestavují své linie pro další střet.',
    waitingForReveal: 'Čeká se na odhalení dalšího útočníka.',
    npcDefendingAutomatically: 'NPC se brání automaticky.',
    attackerQueue: 'Fronta útočníků',
    remaining: (count) => `Zbývá ${count}`,
    hiddenColumn: 'Skrytá kolona',
    revealedAttacker: 'Odhalený útočník',
    noRevealedAttacker: 'Momentálně není odhalen žádný útočník.',
    revealNextAttacker: 'Odhalit dalšího útočníka',
    defenderPool: 'Skupina obránců',
    tapCardToDeploy: 'Klikni na kartu pro nasazení',
    cardsInReserve: 'Karty v záloze',
    noDefenderCards: 'Ve skupině už nezůstaly žádné obranné karty.',
    resolvedDuels: 'Vyhodnocené souboje',
    waitingForFirstClash: 'Bojiště stále čeká na svůj první střet.',
    defenderHeldLine: 'Obránce udržel linii',
    attackerBrokeThrough: 'Útočník prorazil',
  },
  selector: {
    title: 'Výběr obránců',
    heading: 'Sestav svou bitevní linii',
    selected: (selected, required) => `Vybráno ${selected} / ${required}`,
    instruction: (requiredCount) =>
      `Vyber přesně ${requiredCount} karet z dostupné armády pro obranu tohoto kola.`,
    committedNotice: 'Po potvrzení se tyto karty stanou tvou otevřenou obrannou skupinou pro toto kolo.',
    confirmDefenders: 'Potvrdit obránce',
  },
  restArea: {
    restingCount: (count) => `${count} odpočívá`,
    empty: 'V tomto pluku momentálně neodpočívají žádné karty.',
    roundsRemaining: (rounds) =>
      `${rounds} ${rounds === 1 ? 'kolo' : rounds >= 2 && rounds <= 4 ? 'kola' : 'kol'}`,
  },
  cards: {
    power: 'Síla',
    backLabelTop: 'Císařská',
    backLabelBottom: 'garda',
    faceDownAriaLabel: 'Karta lícem dolů',
    cardAriaLabel: (rank, suit, power) => `${rank} ${suit}, síla ${power}`,
  },
}

export const translations: Record<Language, Translations> = {
  en,
  cs,
}
