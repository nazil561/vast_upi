/**
 * PactPay - Bank Directory
 * 
 * Demo Indian banks for the simulated payment network
 */

import { BankData } from '../types';

export const BANKS: BankData[] = [
  { bankId: 'sbi', name: 'State Bank of India', shortName: 'SBI', active: true, demoOnly: true },
  { bankId: 'hdfc', name: 'HDFC Bank', shortName: 'HDFC', active: true, demoOnly: true },
  { bankId: 'icici', name: 'ICICI Bank', shortName: 'ICICI', active: true, demoOnly: true },
  { bankId: 'axis', name: 'Axis Bank', shortName: 'Axis', active: true, demoOnly: true },
  { bankId: 'kotak', name: 'Kotak Mahindra Bank', shortName: 'Kotak', active: true, demoOnly: true },
  { bankId: 'bob', name: 'Bank of Baroda', shortName: 'BoB', active: true, demoOnly: true },
  { bankId: 'pnb', name: 'Punjab National Bank', shortName: 'PNB', active: true, demoOnly: true },
  { bankId: 'canara', name: 'Canara Bank', shortName: 'Canara', active: true, demoOnly: true },
  { bankId: 'union', name: 'Union Bank of India', shortName: 'Union', active: true, demoOnly: true },
  { bankId: 'indian', name: 'Indian Bank', shortName: 'Indian', active: true, demoOnly: true },
  { bankId: 'idbi', name: 'IDBI Bank', shortName: 'IDBI', active: true, demoOnly: true },
  { bankId: 'indusind', name: 'IndusInd Bank', shortName: 'IndusInd', active: true, demoOnly: true },
  { bankId: 'federal', name: 'Federal Bank', shortName: 'Federal', active: true, demoOnly: true },
  { bankId: 'rbl', name: 'RBL Bank', shortName: 'RBL', active: true, demoOnly: true },
  { bankId: 'yes', name: 'Yes Bank', shortName: 'Yes', active: true, demoOnly: true },
  { bankId: 'boi', name: 'Bank of India', shortName: 'BoI', active: true, demoOnly: true },
  { bankId: 'central', name: 'Central Bank of India', shortName: 'Central', active: true, demoOnly: true },
  { bankId: 'ioc', name: 'Indian Overseas Bank', shortName: 'IOB', active: true, demoOnly: true },
  { bankId: 'uco', name: 'UCO Bank', shortName: 'UCO', active: true, demoOnly: true },
  { bankId: 'psb', name: 'Punjab & Sind Bank', shortName: 'PSB', active: true, demoOnly: true },
  { bankId: 'south_indian', name: 'South Indian Bank', shortName: 'South Indian', active: true, demoOnly: true },
  { bankId: 'kvb', name: 'Karur Vysya Bank', shortName: 'KVB', active: true, demoOnly: true },
  { bankId: 'cub', name: 'City Union Bank', shortName: 'CUB', active: true, demoOnly: true },
  { bankId: 'tmb', name: 'Tamilnad Mercantile Bank', shortName: 'TMB', active: true, demoOnly: true },
];

export function getBankById(bankId: string): BankData | undefined {
  return BANKS.find(bank => bank.bankId === bankId);
}

export function getActiveBanks(): BankData[] {
  return BANKS.filter(bank => bank.active);
}

export function isValidBank(bankId: string): boolean {
  return BANKS.some(bank => bank.bankId === bankId && bank.active);
}
