/// Quantum dynamics stand-in: Trotterized transverse-field Ising evolution on
/// an N₁ × N₂ lattice. See Common.qs for what "stand-in" means here.
namespace QuantumDynamics {
    import Std.Math.*;

    /// exp(-i θ Z⊗Z / 2) on one lattice bond.
    operation ApplyCouplingBond(qs : Qubit[], a : Int, b : Int, angle : Double) : Unit {
        CNOT(qs[a], qs[b]);
        Rz(angle, qs[b]);
        CNOT(qs[a], qs[b]);
    }

    /// One Trotter step on the lattice: ZZ coupling along both the row and the
    /// column bonds, then the transverse field on every site.
    operation TrotterStep(
        qs : Qubit[],
        n1 : Int,
        n2 : Int,
        couplingAngle : Double,
        fieldAngle : Double
    ) : Unit {
        for row in 0..n1 - 1 {
            for col in 0..n2 - 1 {
                let here = row * n2 + col;
                if col < n2 - 1 {
                    ApplyCouplingBond(qs, here, here + 1, couplingAngle);
                }
                if row < n1 - 1 {
                    ApplyCouplingBond(qs, here, here + n2, couplingAngle);
                }
            }
        }
        for q in qs {
            Rx(fieldAngle, q);
        }
    }

    /// The lattice holds N₁ × N₂ sites and the evolution runs
    /// ceil(totalTime / trotterStep) steps, so the hyperparameters set both the
    /// width and the depth of the circuit.
    operation Run(
        n1 : Int,
        n2 : Int,
        totalTime : Double,
        trotterStep : Double,
        couplingJ : Double,
        fieldG : Double
    ) : Result[] {
        let steps = MaxI(1, Ceiling(totalTime / trotterStep));
        use qs = Qubit[n1 * n2];
        for _ in 1..steps {
            TrotterStep(qs, n1, n2, couplingJ * trotterStep, fieldG * trotterStep);
        }
        return MResetEachZ(qs);
    }
}
