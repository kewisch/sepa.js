/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import {
  Document,
  validateIBAN,
  checksumIBAN,
  validateCreditorID,
  checksumCreditorID,
  setIDSeparator,
  enableValidations
} from './sepa';

export default {
  Document,
  validateIBAN,
  checksumIBAN,
  validateCreditorID,
  checksumCreditorID,
  setIDSeparator,
  enableValidations
};