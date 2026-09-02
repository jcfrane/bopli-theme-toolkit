import { definePageTemplate, field } from '@bopli/theme-sdk/authoring';

export default definePageTemplate({
  name: 'Standard page',
  default: true,
  fields: {
    body: field.longText(),
  },
});
