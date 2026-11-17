// Subset of IGuardianCouncil (contracts/src/interfaces/IGuardianCouncil.sol, frozen by CTR-001).
import { parseAbi } from "viem";

export const councilAbi = parseAbi([
  "function approve(uint256 id)",
  "function members(uint256 i) view returns (address)",
  "function approvedBy(uint256 id, address member) view returns (bool)",
  "error NotCouncilMember()",
  "error NotTightening()",
  "error NeedsThreshold()",
  "error ConflictOfInterest()",
  "error AlreadyApproved()",
  "error ProposalNotOpen()",
  "error NotProposer()",
  "error TargetNotAllowed()",
  "error UnknownCall()",
  "error BadCallArgs()",
  "error UnknownProposal()",
  "error TimelockNotReady(uint64 eta)",
]);

/** The Council has 3 seats. */
export const COUNCIL_SEATS = 3;
