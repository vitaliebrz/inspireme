import { Router } from 'express';
import authRoutes from './auth.js';
import feedRoutes from './feed.js';
import categoriesRoutes from './categories.js';
import searchRoutes from './search.js';
import ideasRoutes from './ideas.js';
import chatRoutes from './chat.js';
import collaborationsRoutes from './collaborations.js';
import investmentsRoutes from './investments.js';
import giveawayRoutes from './giveaway.js';
import subscriptionsRoutes from './subscriptions.js';
import profilesRoutes from './profiles.js';
import notificationsRoutes from './notifications.js';
import adminRoutes from './admin.js';
import gdprRoutes from './gdpr.js';
import groupsRoutes from './groups.js';
import supportRoutes from './support.js';

const router = Router();

router.use('/auth', authRoutes);
router.use('/categories', categoriesRoutes);
router.use('/feed', feedRoutes);
router.use('/search', searchRoutes);
router.use('/ideas', ideasRoutes);
router.use('/chat', chatRoutes);
router.use('/collaborations', collaborationsRoutes);
router.use('/investments', investmentsRoutes);
router.use('/giveaways', giveawayRoutes);
router.use('/subscriptions', subscriptionsRoutes);
router.use('/profiles', profilesRoutes);
router.use('/notifications', notificationsRoutes);
router.use('/admin', adminRoutes);
router.use('/gdpr', gdprRoutes);
router.use('/groups', groupsRoutes);
router.use('/support', supportRoutes);

export default router;
