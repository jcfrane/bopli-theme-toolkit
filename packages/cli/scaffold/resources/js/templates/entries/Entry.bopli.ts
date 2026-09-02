import { defineEntryTemplate, field } from '@bopli/theme-sdk/authoring';

export default defineEntryTemplate({
  name: 'Standard entry',
  default: true,
  fields: {
    body: field.longText({ required: true }),
  },
});
