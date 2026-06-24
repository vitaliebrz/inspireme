import { body } from 'express-validator';

const PERSONAL_EMAIL_DOMAINS = [
  'gmail.com', 'yahoo.com', 'yahoo.ro', 'hotmail.com',
  'hotmail.ro', 'outlook.com', 'live.com', 'icloud.com',
];

const passwordRules = [
  body('password')
    .isLength({ min: 8 }).withMessage('Parola trebuie să aibă minim 8 caractere')
    .matches(/[A-Z]/).withMessage('Parola trebuie să conțină cel puțin o literă mare')
    .matches(/[0-9]/).withMessage('Parola trebuie să conțină cel puțin un număr'),
  body('confirmPassword')
    .custom((value: string, { req }) => {
      if (value !== (req.body as { password: string }).password) {
        throw new Error('Parolele nu coincid');
      }
      return true;
    }),
];

export const registerElevValidators = [
  body('firstName').trim().notEmpty().withMessage('Prenumele este obligatoriu'),
  body('lastName').trim().notEmpty().withMessage('Numele este obligatoriu'),
  body('email').isEmail().withMessage('Email invalid'),
  ...passwordRules,
  body('isUnder16').isBoolean().withMessage('Câmpul isUnder16 este obligatoriu'),
  body('parentEmail')
    .if(body('isUnder16').equals('true'))
    .isEmail().withMessage('Email-ul părintelui este invalid sau lipsă'),
  body('acceptTerms')
    .custom((v: unknown) => v === true || v === 'true')
    .withMessage('Trebuie să accepți termenii și condițiile'),
  // Profil (opționale la pasul 2)
  body('school').optional().trim(),
  body('class').optional().trim(),
  body('city').optional().trim(),
  body('bio').optional().trim().isLength({ max: 500 }).withMessage('Bio-ul poate avea maxim 500 caractere'),
  body('interests').optional().isArray().withMessage('Interesele trebuie să fie un array'),
];

export const registerAntreprenorValidators = [
  body('firstName').trim().notEmpty().withMessage('Prenumele este obligatoriu'),
  body('lastName').trim().notEmpty().withMessage('Numele este obligatoriu'),
  body('email')
    .isEmail().withMessage('Email invalid')
    .custom((value: string) => {
      const domain = value.split('@')[1]?.toLowerCase() ?? '';
      if (PERSONAL_EMAIL_DOMAINS.includes(domain)) {
        throw new Error('Este necesar un email de business (nu gmail, yahoo, hotmail etc.)');
      }
      return true;
    }),
  ...passwordRules,
  body('company').optional().trim(),
  body('position').optional().trim(),
  body('domain').notEmpty().withMessage('Domeniul de activitate este obligatoriu'),
  body('website').optional({ checkFalsy: true }).isURL().withMessage('URL website invalid'),
  body('bioMentor').optional().trim().isLength({ max: 1000 }),
  body('confirmAdult')
    .custom((v: unknown) => v === true || v === 'true')
    .withMessage('Trebuie să confirmi că ai minim 18 ani și activezi profesional'),
  body('acceptTerms')
    .custom((v: unknown) => v === true || v === 'true')
    .withMessage('Trebuie să accepți termenii și condițiile'),
];

export const loginValidators = [
  body('email').isEmail().withMessage('Email invalid'),
  body('password').notEmpty().withMessage('Parola este obligatorie'),
];

export const forgotPasswordValidators = [
  body('email').isEmail().withMessage('Email invalid'),
];

export const resetPasswordValidators = [
  body('token').notEmpty().withMessage('Token lipsă'),
  body('password')
    .isLength({ min: 8 }).withMessage('Parola trebuie să aibă minim 8 caractere')
    .matches(/[A-Z]/).withMessage('Parola trebuie să conțină cel puțin o literă mare')
    .matches(/[0-9]/).withMessage('Parola trebuie să conțină cel puțin un număr'),
];
