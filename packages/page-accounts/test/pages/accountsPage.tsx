// Copyright 2017-2021 @polkadot/page-accounts authors & contributors
// SPDX-License-Identifier: Apache-2.0

import { render, RenderResult, screen, within } from '@testing-library/react';
import BN from 'bn.js';
import React, { Suspense } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { ThemeProvider } from 'styled-components';

import { lightTheme } from '@polkadot/apps/themes';
import { POLKADOT_GENESIS } from '@polkadot/apps-config';
import { ApiContext } from '@polkadot/react-api';
import { ApiProps } from '@polkadot/react-api/types';
import { QueueProvider } from '@polkadot/react-components/Status/Context';
import { PartialQueueTxExtrinsic, QueueProps, QueueTxExtrinsicAdd } from '@polkadot/react-components/Status/types';
import { TypeRegistry } from '@polkadot/types/create';
import { Balance, BlockNumber } from '@polkadot/types/interfaces';
import { keyring } from '@polkadot/ui-keyring';
import { formatBalance } from '@polkadot/util';

import { AccountOverrides, mockAccountHooks } from '../hooks/default';
import Overview from '../pages/../../src/Accounts/index';

let queueExtrinsic: (value: PartialQueueTxExtrinsic) => void;

class NotYetRendered extends Error {
}

// utility wrapper over an account item in accounts table, serves basic assertions about an account row
export class AccountRow {
  public primaryRow: HTMLElement;
  public detailsRow: HTMLElement;

  constructor (primaryRow: HTMLElement, detailsRow: HTMLElement) {
    this.primaryRow = primaryRow;
    this.detailsRow = detailsRow;
  }

  async assertBalancesTotal (expected: Balance): Promise<void> {
    const balanceActual = await within(this.primaryRow).findByTestId('balance-summary');
    const balanceExpected = format(expected);

    expect(balanceActual).toHaveTextContent(balanceExpected);
  }

  async assertBalancesDetails (expected: {name: string, amount: Balance}[]): Promise<void> {
    for (const expectedBalanceDetailsItem of expected) {
      const labelElement = await within(this.detailsRow).findByText(expectedBalanceDetailsItem.name);
      const balanceElement = labelElement.nextSibling;
      const amount = format(expectedBalanceDetailsItem.amount);

      expect(balanceElement).toHaveTextContent(amount);
    }
  }

  async assertParentAccountName (expectedParentAccount: string): Promise<void> {
    const parentAccount = await within(this.primaryRow).findByTestId('parent');

    expect(parentAccount).toHaveTextContent(expectedParentAccount);
  }

  async assertTags (tagsContent: string): Promise<void> {
    const tagsActual = await within(this.detailsRow).findByTestId('tags');

    expect(tagsActual).toHaveTextContent(tagsContent);
  }

  async assertShortAddress (expectedShortAddress: string): Promise<void> {
    const actualShortAddress = await within(this.primaryRow).findByTestId('short-address');

    expect(actualShortAddress).toHaveTextContent(expectedShortAddress);
  }
}

jest.mock('@polkadot/react-hooks/useAccounts', () => ({
  useAccounts: () => mockAccountHooks.useAccounts
}));

jest.mock('@polkadot/react-hooks/useAccountInfo', () => ({
  useAccountInfo: (address: string) => mockAccountHooks.accountsMap[address].info
}));

jest.mock('@polkadot/react-hooks/useLoadingDelay', () => ({
  useLoadingDelay: () => false
}));

jest.mock('@polkadot/react-hooks/useBalancesAll', () => ({
  useBalancesAll: (address: string) => mockAccountHooks.accountsMap[address].balance
}));

jest.mock('@polkadot/react-hooks/useStakingInfo', () => ({
  useStakingInfo: (address: string) => mockAccountHooks.accountsMap[address].staking
}));

jest.mock('@polkadot/react-hooks/useBestNumber', () => ({
  useBestNumber: () => 1
}));

export class AccountsPage {
  private renderResult?: RenderResult

  renderPage (accounts: [string, AccountOverrides][]): void {
    mockAccountHooks.setAccounts(accounts);

    accounts.forEach(([address, { meta }]) => {
      keyring.addExternal(address, meta);
    });

    const mockApi: ApiProps = {
      api: {
        derive: {
          accounts: {
            info: () => Promise.resolve(() => { /**/
            })
          },
          balances: {
            all: () => ({
              accountNonce: mockAccountHooks.nonce,
              additional: [],
              freeBalance: 0,
              lockedBreakdown: [],
              reservedBalance: 0
            })
          },
          chain: {
            bestNumber: () => new BN(1) as BlockNumber
          }
        },
        genesisHash: new TypeRegistry().createType('Hash', POLKADOT_GENESIS),
        query: {},
        registry: { chainDecimals: [12], chainTokens: ['Unit'] },
        tx: {
          council: {
          }
        }
      },
      systemName: 'substrate'
    } as unknown as ApiProps;

    queueExtrinsic = jest.fn() as QueueTxExtrinsicAdd;
    const queue = {
      queueExtrinsic
    } as QueueProps;

    this.renderResult = render(
      <>
        <div id='tooltips'/>
        <Suspense fallback='...'>
          <QueueProvider value={queue}>
            <MemoryRouter>
              <ThemeProvider theme={lightTheme}>
                <ApiContext.Provider value={mockApi}>
                  <Overview/>
                </ApiContext.Provider>
              </ThemeProvider>
            </MemoryRouter>
          </QueueProvider>
        </Suspense>
      </>
    );
  }

  async findAccountsTable (): Promise<HTMLElement> {
    this.assertRendered();

    return await screen.findByRole('table');
  }

  async findAccountRows (): Promise<AccountRow[]> {
    const table = await this.findAccountsTable();
    const tableBody = table.getElementsByTagName('tbody')[0];
    const htmlRows = (await within(tableBody).findAllByRole('row'))
      .filter((r) => r.className.startsWith('Account-'));
    const rows: AccountRow[] = [];

    for (let rowIdx = 0; rowIdx < htmlRows.length; rowIdx = rowIdx + 2) {
      const primary = htmlRows[rowIdx];
      const details = htmlRows[rowIdx + 1];

      rows.push(new AccountRow(primary, details));
    }

    return rows;
  }

  async findSortBySection (): Promise<HTMLElement> {
    this.assertRendered();

    return await screen.findByTestId('sort-by-section');
  }

  async findSortByDropdownCurrent (): Promise<HTMLElement> {
    this.assertRendered();

    const section = await this.findSortBySection();
    const alerts = await within(section).findAllByRole('alert');
    const names = await within(section).findAllByText(/\w+/);
    const ret = names.filter((x) => alerts.includes(x));

    expect(ret).toHaveLength(1);

    return ret[0];
  }

  async findSortByDropdownItem (name: string): Promise<HTMLElement> {
    this.assertRendered();

    const section = await this.findSortBySection();
    const alerts = await within(section).findAllByRole('alert');
    const names = await within(section).findAllByText(name);
    const ret = names.filter((x) => !alerts.includes(x));

    expect(ret).toHaveLength(1);

    return ret[0];
  }

  async findSortByReverseButton (): Promise<HTMLElement> {
    this.assertRendered();

    const section = await this.findSortBySection();

    return await within(section).findByRole('button');
  }

  format (amount: Balance | BN): string {
    return formatBalance(amount, { decimals: 12, forceUnit: '-', withUnit: true });
  }

  private assertRendered () {
    if (this.renderResult === undefined) {
      throw new NotYetRendered();
    }
  }
}

export const format = (amount: Balance | BN): string => {
  return formatBalance(amount, { decimals: 12, forceUnit: '-', withUnit: true });
};
