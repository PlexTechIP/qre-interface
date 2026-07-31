/// Shor's factoring stand-in, sized by Bit Size and Generator.
/// See Common.qs for what "stand-in" means here.
namespace ShorsFactoring {
    import Common.*;

    /// Stand-in for modular exponentiation by `generator`. The number of
    /// multiply rounds per counting qubit varies with the generator, and each
    /// round touches the whole work register — so the cost grows with Bit Size
    /// through both registers, as the real routine does.
    operation ModularExponentiationStandIn(
        counting : Qubit[],
        work : Qubit[],
        generator : Int
    ) : Unit {
        let rounds = generator % 8 + 1;
        for i in 0..Length(counting) - 1 {
            for _ in 1..rounds {
                for w in work {
                    Controlled Rz([counting[i]], (0.9, w));
                }
                Controlled X(counting[i..i], work[0]);
            }
        }
    }

    /// `bitSize` is the modulus width: the counting register is the usual 2n
    /// wide and the work register n.
    operation Run(bitSize : Int, generator : Int) : Result[] {
        use counting = Qubit[2 * bitSize];
        use work = Qubit[bitSize];
        ApplyToEach(H, counting);
        X(work[0]);

        ModularExponentiationStandIn(counting, work, generator);
        ApplyApproximateInverseQft(counting);

        let countingResults = MResetEachZ(counting);
        let workResults = MResetEachZ(work);
        return countingResults + workResults;
    }
}
