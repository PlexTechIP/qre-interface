/// Ekerå-Håstad factoring stand-in, sized by the RSA instance and Generator.
/// See Common.qs for what "stand-in" means here.
namespace EkeraHastadFactoring {
    import Common.*;
    import Std.Math.*;
    import Std.Convert.*;

    /// Stand-in for the short discrete-logarithm oracle. Each counting qubit
    /// controls a rotation on every work qubit; the generator varies the angle,
    /// which changes the synthesis cost of the rotations rather than their count.
    operation ShortDiscreteLogStandIn(
        counting : Qubit[],
        work : Qubit[],
        generator : Int
    ) : Unit {
        let angle = 1.1 + IntAsDouble(generator % 8) * 0.1;
        for i in 0..Length(counting) - 1 {
            for w in work {
                Controlled Rz([counting[i]], (angle, w));
            }
        }
    }

    /// `modulusBits` is the RSA modulus width. The Ekerå-Håstad advantage over
    /// Shor is the short exponent: the counting register is about half the
    /// modulus width rather than twice it.
    operation Run(modulusBits : Int, generator : Int) : Result[] {
        let countingWidth = MaxI(1, modulusBits / 2);
        use counting = Qubit[countingWidth];
        use work = Qubit[modulusBits];
        ApplyToEach(H, counting);
        X(work[0]);

        ShortDiscreteLogStandIn(counting, work, generator);
        ApplyApproximateInverseQft(counting);

        let countingResults = MResetEachZ(counting);
        let workResults = MResetEachZ(work);
        return countingResults + workResults;
    }
}
