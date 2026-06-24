import { Router } from 'express';
import authRoutes from './auth.js';
import feedRoutes from './feed.js';
import ideasRoutes from './ideas.js';
import chatRoutes from './chat.js';
import giveawayRoutes from './giveaway.js';
import subscriptionsRoutes from './subscriptions.js';
import profilesRoutes from './profiles.js';
import notificationsRoutes from './notifications.js';
import adminRoutes from './admin.js';
import gdprRoutes from './gdpr.js';

const router = Router();

router.use('/auth', authRoutes);
router.use('/feed', feedRoutes);
router.use('/ideas', ideasRoutes);
router.use('/chat', chatRoutes);
router.use('/giveaways', giveawayRoutes);
router.use('/subscriptions', subscriptionsRoutes);
router.use('/profiles', profilesRoutes);
router.use('/notifications', notificationsRoutes);
router.use('/admin', adminRoutes);
router.use('/gdpr', gdprRoutes);

export default router;
