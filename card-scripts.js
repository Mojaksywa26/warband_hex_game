window.CardScripts = {
  battle: {
    play: async ({ discardCard, refundCard, triggerBattle }) => {
      discardCard();
      const fought = await triggerBattle();
      if (!fought) refundCard();
    }
  },
  reset_movement: {
    play: ({ discardCard, resetMovement }) => {
      resetMovement();
      discardCard();
    }
  },
  activate_warband_effect: {
    play: ({ discardCard, activateAttackModifiers }) => {
      activateAttackModifiers();
      discardCard();
    }
  },
  scrapfall: {
    play: ({ discardCard, playScrapfall }) => {
      playScrapfall();
      discardCard();
    }
  },
  attack_modifier: {
    play: ({ card, promptForToken }) => {
      promptForToken({ owner: card.target_owner || 'self' });
    }
  },
  aedific_feat: {
    unavailableReason: ({ aedificFeatUnavailableReason }) => aedificFeatUnavailableReason(),
    play: ({ promptForAedificFeat, registerCancellation, cancelAedificFeat }) => {
      if (promptForAedificFeat()) registerCancellation(cancelAedificFeat);
    },
    cancel: ({ cancelAedificFeat }) => cancelAedificFeat()
  },
  beasthunter_feat: {
    unavailableReason: ({ beasthunterFeatUnavailableReason }) => beasthunterFeatUnavailableReason(),
    play: ({ promptForBeasthunterFeat, registerCancellation, cancelBeasthunterFeat }) => {
      if (promptForBeasthunterFeat()) registerCancellation(cancelBeasthunterFeat);
    },
    cancel: ({ cancelBeasthunterFeat }) => cancelBeasthunterFeat()
  }
};
