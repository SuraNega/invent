'use strict';

const { Router } = require('express');
const { body }   = require('express-validator');
const authorize  = require('../../middleware/authorize');
const ctrl       = require('./returns.controller');

const router = Router();

router.get('/',    authorize('owner', 'cashier'), ctrl.list);
router.get('/:id', ctrl.getOne);

router.post(
  '/',
  [
    body('product_id').isInt({ gt: 0 }).withMessage('product_id is required'),
    body('quantity').isInt({ gt: 0 }).withMessage('quantity must be > 0'),
    body('reason')
      .isIn(['wrong_item', 'defective', 'changed_mind', 'other'])
      .withMessage('Invalid reason'),
    body('condition')
      .isIn(['resellable', 'damaged', 'incomplete_set'])
      .withMessage('Invalid condition'),
    body('refund_type')
      .isIn(['cash', 'store_credit', 'exchange'])
      .withMessage('Invalid refund_type'),
    body('sale_id').optional().isInt({ gt: 0 }),
    body('refund_amount').optional().isFloat({ min: 0 }),
  ],
  ctrl.create
);

module.exports = router;
