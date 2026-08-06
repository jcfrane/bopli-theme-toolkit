import { inject } from 'vue';

export const BOPLI_NAVIGATION_KEY = Symbol.for('bopli.theme.navigation');

export function useBopliNavigation() {
    const navigation = inject(BOPLI_NAVIGATION_KEY);

    if (!navigation) {
        throw new Error('Bopli theme navigation is only available inside the theme runtime.');
    }

    return navigation;
}
