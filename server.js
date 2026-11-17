
require('dotenv').config();

const express = require('express');
const Stripe = require('stripe');
const path = require('path');

const app = express();
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

const PORT = process.env.PORT || 3000;
const APP_URL = process.env.APP_URL;

const plans = {
  starter: process.env.STRIPE_PRICE_STARTER,
  pro: process.env.STRIPE_PRICE_PRO,
  business: process.env.STRIPE_PRICE_BUSINESS
};

// Webhook ham gövdeyle doğrulanmalı.
app.post(
  '/api/stripe-webhook',
  express.raw({ type: 'application/json' }),
  (req, res) => {
    let event;

    try {
      event = stripe.webhooks.constructEvent(
        req.body,
        req.headers['stripe-signature'],
        process.env.STRIPE_WEBHOOK_SECRET
      );
    } catch (err) {
      return res.status(400).send(`Webhook error: ${err.message}`);
    }

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;

      // Burada siparişi veritabanına kaydedin.
      console.log('Ödeme tamamlandı:', session.id);
    }

    if (event.type === 'invoice.paid') {
      const invoice = event.data.object;
      console.log('Abonelik ödemesi alındı:', invoice.id);
    }

    if (event.type === 'invoice.payment_failed') {
      console.log('Abonelik ödemesi başarısız.');
    }

    res.json({ received: true });
  }
);

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// SaaS aboneliği başlat
app.post('/api/create-checkout-session', async (req, res) => {
  try {
    const { plan } = req.body;
    const priceId = plans[plan];

    if (!priceId) {
      return res.status(400).json({ error: 'Geçersiz paket.' });
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${APP_URL}/?payment=success`,
      cancel_url: `${APP_URL}/?payment=cancelled`
    });

    res.json({ url: session.url });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Ödeme oluşturulamadı.' });
  }
});

// Stripe Connect satıcı hesabı oluştur
app.post('/api/connect-onboarding', async (req, res) => {
  try {
    const account = await stripe.accounts.create({
      type: 'express'
    });

    // Üretim sisteminde account.id kullanıcıya ait
    // veritabanı kaydına bağlanmalıdır.
    const link = await stripe.accountLinks.create({
      account: account.id,
      refresh_url: `${APP_URL}/?connect=refresh`,
      return_url: `${APP_URL}/?connect=complete`,
      type: 'account_onboarding'
    });

    res.json({ url: link.url });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      error: 'Stripe Connect kaydı oluşturulamadı.'
    });
  }
});

app.listen(PORT, () => {
  console.log(`Platform çalışıyor: http://localhost:${PORT}`);
});
