/// Phase estimation stand-in, sized by Precision and Register Size.
/// See Common.qs for what "stand-in" means here.
namespace PhaseEstimation {
    import Common.*;

    /// U^power on the target register, controlled on one counting qubit. The
    /// unitary is not fast-forwardable, so U^(2^k) costs 2^k applications —
    /// which is why Precision drives the depth exponentially, as it does in the
    /// textbook algorithm.
    operation ControlledUnitary(power : Int, control : Qubit, target : Qubit[]) : Unit {
        for _ in 1..power {
            for t in target {
                Controlled Z([control], t);
                Controlled Rz([control], (0.7, t));
            }
        }
    }

    /// `precision` counting qubits read out the phase of a `registerSize`-qubit
    /// eigenstate, so Precision sets both the readout width and the depth while
    /// Register Size sets the width of each controlled application.
    ///
    /// REQUIRES precision <= 63, which the contract enforces (see the
    /// `precision` max in shared/benchmarkParams.ts): `1 <<< i` below overflows
    /// Int64 to a negative power at i = 63, and `for _ in 1..power` then skips
    /// that term instead of failing.
    operation Run(precision : Int, registerSize : Int) : Result[] {
        use counting = Qubit[precision];
        use target = Qubit[registerSize];
        X(target[0]);
        ApplyToEach(H, counting);

        for i in 0..Length(counting) - 1 {
            ControlledUnitary(1 <<< i, counting[i], target);
        }

        ApplyApproximateInverseQft(counting);
        let phaseResults = MResetEachZ(counting);
        let targetResults = MResetEachZ(target);
        return phaseResults + targetResults;
    }
}
