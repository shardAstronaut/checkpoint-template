import { uint256, validateAndParseAddress } from 'starknet';
import { starknet } from '@snapshot-labs/checkpoint';
import { Liquity_Collateral, Liquity_Daily_Collateral } from '../.checkpoint/models';
import { Event } from '@snapshot-labs/checkpoint/dist/src/providers/starknet';

export const ZeroAddress = '0x0000000000000000000000000000000000000000000000000000000000000000';

export const writers = (): Record<string, starknet.Writer> => {
  return {
    liquity_eth_Transfer: async ({ block, tx, rawEvent, event }) => {
      if (!block || !event || !rawEvent) return;
      const { data } = rawEvent as Event;

      const from = validateAndParseAddress(data[0]);
      const to = validateAndParseAddress(data[1]);
      const amount = uint256.uint256ToBN({ low: data[2], high: data[3] });

      const timestamp = block.timestamp - (block.timestamp % 86400);

      let collateral: Liquity_Collateral | null;
      let dailyColl: Liquity_Daily_Collateral | null;

      if (from == ZeroAddress || to == ZeroAddress) {
        // Ignore RequestBatch/ResponseBatch when bridge tokens from L2 <> L1.
        return;
      } else if (
        to == '0x03580a65260563b5511ddf2eafb83d6b309dce7fc25271df8c040a437f09a399' ||
        to == '0x02a67288e48a8c4e2881aee422da7841fc11fef195e0a81f929871c77f07509d'
      ) {
        // Borrow the `from` is the user and the `to` is the trove address.
        const totalcollateralId = `${to}_${from}`;
        const dailyCollId = `${to}_${from}_${timestamp}`;

        collateral = await Liquity_Collateral.loadEntity(totalcollateralId);
        if (!collateral) {
          collateral = new Liquity_Collateral(totalcollateralId);
          collateral.user = from;
          collateral.trove = to;
          collateral.balance = 0n;
        }
        collateral.balance = BigInt(collateral.balance) + amount;
        collateral.count++;

        dailyColl = await Liquity_Daily_Collateral.loadEntity(dailyCollId);
        if (!dailyColl) {
          dailyColl = new Liquity_Daily_Collateral(dailyCollId);
          dailyColl.user = from;
          dailyColl.trove = to;
          dailyColl.balance = collateral.balance;
        } else {
          dailyColl.balance = BigInt(dailyColl.balance) + amount;
        }
      } else if (
        from == '0x03580a65260563b5511ddf2eafb83d6b309dce7fc25271df8c040a437f09a399' ||
        from == '0x02a67288e48a8c4e2881aee422da7841fc11fef195e0a81f929871c77f07509d'
      ) {
        // Repay the `to` is the trove address and the `from` is the user.

        const totalcollateralId = `${from}_${to}`;
        const dailyCollId = `${from}_${to}_${timestamp}`;
        collateral = await Liquity_Collateral.loadEntity(totalcollateralId);
        if (!collateral) return;
        let remaining = BigInt(collateral.balance) - amount;
        // Info: This check is required because we are tracking the LUSD balance the users receive but nio
        collateral.balance = remaining > 0n ? remaining : 0n;
        collateral.count++;

        dailyColl = await Liquity_Daily_Collateral.loadEntity(dailyCollId);
        if (!dailyColl) {
          dailyColl = new Liquity_Daily_Collateral(dailyCollId);
          dailyColl.user = to;
          dailyColl.trove = from;
          dailyColl.balance = collateral.balance;
        } else {
          remaining = BigInt(dailyColl.balance) - amount;
          dailyColl.balance = remaining > 0n ? remaining : 0n;
        }
      } else {
        return;
      }

      collateral.timestamp = timestamp;
      collateral.block = block.block_number;
      dailyColl.timestamp = timestamp;
      dailyColl.block = block.block_number;

      await collateral.save();
      await dailyColl.save();
    }
  };
};
